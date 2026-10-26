import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { runHouseholdAgents, type RunActor } from "../ai/run";
import { buildContextItems, personItems, type PersonLike } from "../context/builders";
import { resolveEntity, resolvePerson } from "../context/resolution";
import { createAppointment, type AppointmentType } from "../health/appointments";
import { createFitnessGoal, FITNESS_ACTIVITY_LABEL, type FitnessActivityType, type FitnessFrequencyPeriod } from "../health/fitness";
import { createIssue, listIssues, setIssueStatus } from "../health/issues";
import { addFamilyEvent } from "../calendar/add-event";
import { waitingWords, wasAdded, type AddedOnItsOwn, type WaitingInHomeSend } from "../homesend/auto-add";
import { setEventCancelled } from "../family/event-detail";
import { createServiceRequest } from "../home/repository";
import { attachIngredients, createMeal, removeMeal } from "../meals/repository";
import { completeSchoolItem, updateSchoolItem } from "../school/repository";
import { movedSchoolWhen } from "../school/times";
import type { MealSlot } from "../meals/meals";
import { createVital, type VitalType } from "../health/vitals";
import { recordAvailabilityException } from "../household/helpers-repository";
import { addBillFromTalk, recordBillPaymentFromTalk, setBillAmountFromTalk, undoBillTalk } from "./bill-talk";
import { addToShoppingList, changeStockFromTalk, linesOf, markBoughtFromTalk, removeFromShoppingList, undoAddToList } from "./grocery-actions";
import type { HouseholdIntent } from "./intent";
import { joinWords } from "./proposal";
import { linkTo } from "./reply-format";
import { formatHourMinute, parseTimeOfDay, reminderMoment } from "./reminder-time";
import { resolveDay } from "./temporal";

/**
 * Carrying an understood request out (product-direction update §7: the
 * conversation is a primary control surface, not a place to be told what
 * the product would do).
 *
 * Before this module, the engine could reach "executed" and nothing was
 * behind it: `converse` downgraded every such proposal to "prepared", and an
 * approved one was answered with "it is on its way" while nothing moved.
 * Here is what actually moves, and the honest line for each.
 *
 * Every write goes through the member's own client, so RLS is the last word
 * on whether this person may do this — an agent never mutates the database
 * directly (CLAUDE.md), it calls the same repository the forms call. What
 * cannot be done yet (a payment, an order, a reassignment) is named as such
 * by `canExecute`, so the engine keeps saying "prepared" rather than "done".
 */

export type ExecutionContext = {
  /** The member's own client — RLS decides. */
  supabase: SupabaseClient;
  householdId: string;
  actorMemberId: string;
  /** Everyone in the household — with the profile words (nickname, "Dad") the resolver matches on, where known. */
  members: readonly PersonLike[];
  timezone: string;
  now?: Date;
  /** Only `check_agents` needs these — who is asking, for the tool gate a run checks per step. */
  actor?: RunActor;
  /**
   * The service-role client, for the one write a member cannot make with
   * their own: a reminder to themself (`notifications` has no INSERT policy
   * for anyone, so nothing can manufacture an interruption). Used only for
   * a row whose recipient is the speaker.
   */
  admin?: SupabaseClient;
  /**
   * HomeSend's own decision once HomeTalk has nothing left to ask about an
   * item: the review the app runs, as this member — added on its own only
   * where the household allows it (Pre Approved and above the bar), else
   * null and it waits in HomeSend. Supplied by the route.
   */
  addFromHomeSend?: (itemId: string) => Promise<AddedOnItsOwn | WaitingInHomeSend | null>;
};

export type ExecutionResult =
  | { ok: true; text: string; result: Record<string, unknown> }
  | { ok: false; reason: string; sayAsIs?: boolean };

/**
 * What HomeTalk says when a write did not go through — the one place, for
 * the app and WhatsApp alike. A refusal that is already a whole, polite
 * answer (a question about the unit, what to do instead) is said as it is
 * (25-038); anything else follows "I tried, and it did not go through".
 */
export function failedReply(done: { reason: string; sayAsIs?: boolean }, lead = "I tried, and it did not go through"): string {
  return done.sayAsIs ? done.reason : `${lead}: ${done.reason}`;
}

/** Whether a governed write exists for this intent right now. */
export function canExecute(intent: HouseholdIntent): boolean {
  switch (intent.action) {
    case "add_to_list":
      return itemsOf(intent).length > 0;
    case "plan_meal":
      return typeof (intent.parameters.mealName ?? intent.parameters.what) === "string" && Boolean(intent.parameters.windowResolved ?? intent.parameters.whenResolved);
    case "set_reminder":
      return typeof intent.parameters.what === "string" && intent.parameters.what.trim().length > 0 && typeof intent.parameters.when === "string";
    case "remove_from_list":
    case "mark_bought":
      return itemsOf(intent).length > 0;
    // A count of what is at home needs a number; "we have eggs" says none.
    case "set_stock":
    case "use_stock":
      return linesOf(intent).some((line) => line.amount !== null);
    case "complete_school_item":
      return typeof intent.parameters.schoolItemId === "string";
    case "raise_service_request":
      return typeof intent.parameters.assetName === "string";
    // Moving something is done only where there is a real record to move:
    // a school item, to one grounded day. A calendar move is not yet.
    case "adjust_schedule":
      return typeof intent.parameters.schoolItemId === "string" && (intent.parameters.toResolved as { precision?: string } | undefined)?.precision === "day";
    // A plan goes on the calendar only with a real time to put it at: a part
    // of a day ("Saturday evening"), or a whole day kept free. "Sometime this
    // weekend" stays a plan the household finishes itself.
    case "plan_event": {
      const window = (intent.parameters.windowResolved ?? intent.parameters.whenResolved) as { precision?: string; window?: unknown } | undefined;
      return Boolean(window && (window.window || (intent.parameters.protected === true && window.precision === "day")));
    }
    case "record_absence":
      return intent.target.kind === "member" && Boolean(intent.target.reference);
    // Bills (11-010): a new one needs only its name; paying or pricing one needs the grounded bill.
    case "add_bill":
      return typeof (intent.parameters.what ?? intent.target.reference) === "string";
    case "record_bill_payment":
      return typeof intent.parameters.billId === "string";
    case "set_bill_amount":
      return typeof intent.parameters.billId === "string" && typeof intent.parameters.amount === "number";
    case "set_preference":
      return Boolean(intent.target.reference);
    case "check_agents":
      return true;
    case "record_health_appointment":
      return Boolean(intent.parameters.appointmentType);
    case "log_health_issue":
      return typeof intent.parameters.label === "string" && intent.parameters.label.trim().length > 0;
    case "resolve_health_issue":
      return typeof intent.parameters.label === "string" && intent.parameters.label.trim().length > 0;
    case "log_vital":
      return typeof intent.parameters.vital === "string" && typeof intent.parameters.reading === "string";
    case "file_with_homesend":
      return intent.utterance.trim().length > 0;
    case "complete_homesend_item":
      return typeof intent.parameters.itemId === "string" && typeof intent.parameters.field === "string" && typeof intent.parameters.answer === "string";
    case "fill_homesend_details":
      return true;
    case "set_fitness_goal":
      return (
        typeof intent.parameters.activity === "string" &&
        intent.parameters.activity.trim().length > 0 &&
        typeof intent.parameters.count === "number" &&
        intent.parameters.count > 0 &&
        (intent.parameters.timesPer === "day" || intent.parameters.timesPer === "week" || intent.parameters.timesPer === "month")
      );
    default:
      return false;
  }
}

/** What HomeSend read a sentence as, in the review's own words. */
const HOMESEND_KIND_WORDS: Record<string, string> = {
  bill: "a bill",
  school_item: "school work",
  activity_item: "something for a class outside school",
  event: "an event for the family calendar",
  grocery_item: "something to buy",
  health_document: "a health document",
  receipt: "a receipt",
};

/**
 * Being told about a new dated thing (the owner, 2026-10-25): the sentence
 * goes through HomeSend's own text entry point — the same reading, the same
 * check against what was said, the same review and the same decision: it
 * waits there for a person unless the household pre-approved it and it needs
 * no question. Nothing reaches a domain table from here except through
 * HomeSend's own governed write (`addFromHomeSend`).
 */
async function fileWithHomeSend(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const { ingestText } = await import("../homesend/ingest");
  const outcome = await ingestText(context.supabase, { householdId: context.householdId, memberId: context.actorMemberId }, { text: intent.utterance });
  const review = linkTo("/home-send", "HomeSend");
  if (outcome.duplicate) return { ok: true, text: `That's already waiting in ${review} for you to check.`, result: { homeSendItemId: outcome.itemId } };
  if (outcome.state === "failed") return { ok: true, text: `I kept that in ${review} under Failed safely: ${outcome.notice}`, result: { homeSendItemId: outcome.itemId } };
  const title = outcome.item.extracted?.title?.trim();
  const kind = HOMESEND_KIND_WORDS[outcome.item.classifiedKind];
  const read = title && kind ? ` I read it as ${kind}: **${title}**.` : "";
  // What it still lacks is asked here, by HomeTalk, one thing at a time (`hometalk/intake-questions.ts`).
  const { intakeQuestion } = await import("../hometalk/intake-questions");
  const next = intakeQuestion({
    itemId: outcome.itemId,
    kind: outcome.item.classifiedKind,
    extracted: outcome.item.extracted,
    asked: [],
    people: context.members,
    ambiguous: outcome.item.understanding?.references.find((reference) => reference.candidates.length > 1)?.candidates ?? [],
  });
  // Nothing to ask: HomeSend's own decision, as for anything sent to it (design §13.2) — added where the
  // household pre-approved it and the reading clears the bar, else it waits.
  const decided = !next && context.addFromHomeSend ? await context.addFromHomeSend(outcome.itemId).catch(() => null) : null;
  if (wasAdded(decided)) {
    const { handedBackText } = await import("../hometalk/intake-questions");
    return { ok: true, text: handedBackText("", { added: decided, stillNeeded: [] }).trim(), result: { homeSendItemId: outcome.itemId, added: decided.where } };
  }
  // Held for a reason the person can act on (I-24): said, with what it read.
  const held = decided ? waitingWords(decided.waiting, decided.title) : null;
  if (held) return { ok: true, text: `${held}${read}`, result: { homeSendItemId: outcome.itemId } };
  return {
    ok: true,
    text: `It's in ${review} for you to check before anything is added.${read}${next ? ` ${next.question}` : ""}`,
    result: { homeSendItemId: outcome.itemId, ...(next ? { clarify: next.clarify } : {}) },
  };
}

/**
 * The answer to HomeTalk's question about a HomeSend item: put onto the item
 * (which still waits in HomeSend), then the next question, or — with nothing
 * left to ask — HomeSend's own decision: added where the household allows it,
 * else it waits. Never a value said back.
 */
async function completeHomeSendItem(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const { answerIntakeQuestion, handedBackText } = await import("../hometalk/intake-questions");
  const itemId = String(intent.parameters.itemId);
  const answered = await answerIntakeQuestion(context.supabase, {
    householdId: context.householdId,
    parameters: intent.parameters,
    answer: String(intent.parameters.answer ?? intent.utterance),
    people: context.members,
    timezone: context.timezone,
    now: context.now ?? new Date(),
  });
  if (!answered.handBack) return { ok: true, text: answered.text, result: { homeSendItemId: itemId, ...(answered.clarify ? { clarify: answered.clarify } : {}) } };
  const decided = context.addFromHomeSend ? await context.addFromHomeSend(itemId).catch(() => null) : null;
  const added = wasAdded(decided) ? decided : null;
  const closing = handedBackText(answered.text, { added: decided, stillNeeded: answered.stillNeeded });
  // Filling in several waiting items (14-050): on to the next one that still needs something.
  const queue = Array.isArray(intent.parameters.queue) ? intent.parameters.queue.filter((id): id is string => typeof id === "string") : [];
  const { nextQueuedQuestion } = await import("../hometalk/intake-questions");
  const next = queue.length > 0 ? await nextQueuedQuestion(context.supabase, { householdId: context.householdId, queue, people: context.members }).catch(() => null) : null;
  if (next) return { ok: true, text: `${closing} Next${next.title ? `, **${next.title}**` : ""}: ${next.question}`, result: { homeSendItemId: itemId, ...(added ? { added: added.where } : {}), clarify: next.clarify } };
  return { ok: true, text: closing, result: { homeSendItemId: itemId, ...(added ? { added: added.where } : {}) } };
}

/**
 * "Yes" to HomeTalk's offer to fill in what waits in HomeSend (14-050): the
 * first item's first question, with the rest queued behind it; "no" leaves
 * them all waiting. Only questions — nothing is written here.
 */
async function fillHomeSendDetails(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  if (intent.parameters.decline === true) return { ok: true, text: "No problem — they'll wait in HomeSend for you.", result: {} };
  const { nextQueuedQuestion, waitingForDetails } = await import("../hometalk/intake-questions");
  const offered = Array.isArray(intent.parameters.itemIds) ? intent.parameters.itemIds.filter((id): id is string => typeof id === "string") : [];
  const queue = offered.length > 0 ? offered : (await waitingForDetails(context.supabase, { householdId: context.householdId, people: context.members, now: context.now ?? new Date() })).map((item) => item.itemId);
  const next = queue.length > 0 ? await nextQueuedQuestion(context.supabase, { householdId: context.householdId, queue, people: context.members }) : null;
  if (!next) return { ok: true, text: "Everything waiting in HomeSend already has what it needs — nothing to fill in.", result: {} };
  return { ok: true, text: `${next.title ? `First, **${next.title}**: ` : ""}${next.question} (Say "skip" to leave one for later.)`, result: { clarify: next.clarify } };
}

/** Why an approved intent still cannot be done by WonderHome itself — said plainly, never as "on its way". */
export function notYetDoable(action: HouseholdIntent["action"]): string {
  switch (action) {
    case "make_payment":
      return `Approved — and paying it myself needs a payment provider connected, which is not live yet. It stays with you under ${linkTo("/bills", "Bills")} for now, and I will not mark it paid until it is.`;
    case "order_items":
      return `Approved — and placing the order myself needs a shop connected, which is not live yet. The list is ready under ${linkTo("/groceries", "Groceries")} whenever you order.`;
    case "assign_responsibility":
      return `Approved. Changing who owns an outcome is done under ${linkTo("/household/responsibilities", "Responsibilities")}, so it is exactly what you intend — I have not changed it on my own.`;
    case "adjust_schedule":
      return `Approved. Moving it on the family calendar is done under ${linkTo("/family", "Family")} for now — I have not moved anything myself.`;
    case "plan_event":
      return `Approved. I have not put anything on the calendar myself yet — add it under ${linkTo("/family", "Family")} and I will keep an eye on it.`;
    default:
      return "Approved — noted, though there is nothing I can do about this on my own yet.";
  }
}

export async function executeIntent(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  // A correction of something already done (Wave 4 §9): undo the earlier
  // write through its own domain service first, then make the corrected
  // one — never a silent overwrite. If the earlier write cannot be undone,
  // nothing changes at all, and the reply says so.
  const corrects = readCorrects(intent.parameters.corrects);
  if (corrects) {
    let undone: { ok: true; text: string; keep?: string[] } | { ok: false; reason: string };
    try {
      undone = await undoForCorrection(corrects, intent, context);
    } catch {
      undone = { ok: false, reason: "I could not undo the earlier change, so I left everything as it was." };
    }
    if (!undone.ok) return { ok: false, reason: undone.reason };
    // What the correction left as it was ("bananas" in "not milk, almond
    // milk") stays on the list untouched, and is not added a second time.
    const kept = new Set((undone.keep ?? []).map((name) => name.toLowerCase()));
    const rest = kept.size > 0 ? itemsOf(intent).filter((name) => !kept.has(name.toLowerCase())) : null;
    const next = rest ? await runIntent({ ...intent, parameters: { ...intent.parameters, items: rest, item: undefined } }, context) : await runIntent(intent, context);
    if (!next.ok) {
      return { ok: false, reason: `${undone.text ? `${undone.text} ` : ""}But the corrected change did not go through: ${next.reason}` };
    }
    return { ok: true, text: `${undone.text ? `${undone.text} ` : ""}${next.text}`, result: { ...next.result, corrected: corrects.actionId } };
  }
  return runIntent(intent, context);
}

async function runIntent(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  try {
    switch (intent.action) {
      case "add_to_list":
        return { ok: true, ...(await addToShoppingList(intent, context)) };
      case "plan_meal":
        return await planMeal(intent, context);
      case "set_reminder":
        return await setReminder(intent, context);
      case "remove_from_list":
        return { ok: true, ...(await removeFromShoppingList(intent, context)) };
      case "set_stock":
      case "use_stock":
        return { ok: true, ...(await changeStockFromTalk(intent, context)) };
      case "mark_bought":
        return { ok: true, ...(await markBoughtFromTalk(intent, { ...context, today: new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(context.now ?? new Date()) })) };
      case "complete_school_item":
        return await markSchoolItemDone(intent, context);
      case "raise_service_request":
        return await raiseServiceRequest(intent, context);
      case "adjust_schedule":
        return await moveSchoolItem(intent, context);
      case "file_with_homesend":
        return await fileWithHomeSend(intent, context);
      case "complete_homesend_item":
        return await completeHomeSendItem(intent, context);
      case "fill_homesend_details":
        return await fillHomeSendDetails(intent, context);
      case "plan_event":
        return await putOnCalendar(intent, context);
      case "record_absence":
        return await recordAbsence(intent, context);
      case "add_bill":
        return await addBillFromTalk(intent, context);
      case "record_bill_payment":
        return await recordBillPaymentFromTalk(intent, context);
      case "set_bill_amount":
        return await setBillAmountFromTalk(intent, context);
      case "check_agents":
        return await runAgentCheck(context);
      case "record_health_appointment":
        return await recordHealthAppointment(intent, context);
      case "log_health_issue":
        return await logHealthIssue(intent, context);
      case "resolve_health_issue":
        return await resolveHealthIssue(intent, context);
      case "log_vital":
        return await logVital(intent, context);
      case "set_fitness_goal":
        return await setFitnessGoal(intent, context);
      case "set_preference":
        return {
          ok: true,
          text: `Remembered: **${String(intent.parameters.statement ?? intent.utterance).replace(/[.!]+$/, "")}**. You can correct me any time, or under ${linkTo("/certification", "What WonderHome believes")}.`,
          result: { remembered: intent.target.reference },
        };
      default:
        return { ok: false, reason: notYetDoable(intent.action) };
    }
  } catch (thrown) {
    if (thrown instanceof ApiError) {
      const sayAsIs = typeof thrown.details === "object" && thrown.details !== null && (thrown.details as { sayAsIs?: unknown }).sayAsIs === true;
      return { ok: false, reason: thrown.message, ...(sayAsIs ? { sayAsIs } : {}) };
    }
    console.error("[conversation] execution failed", { action: intent.action, error: thrown instanceof Error ? thrown.name : "unknown" });
    return { ok: false, reason: "Something went wrong on my side, and nothing was changed." };
  }
}

type CorrectsRecordShape = { actionId: string; actionType: string; result: Record<string, unknown> };

/** The server-built record of what a corrective intent replaces — never read from a model. */
function readCorrects(value: unknown): CorrectsRecordShape | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.actionId !== "string" || typeof record.actionType !== "string") return null;
  return { actionId: record.actionId, actionType: record.actionType, result: (record.result as Record<string, unknown> | null) ?? {} };
}

/**
 * Undoes what an earlier HomeTalk action actually wrote, through the same
 * domain service a person's own undo would use. Only the kinds of write
 * that have such a service; anything else is said so and left alone.
 */
async function undoForCorrection(
  corrects: CorrectsRecordShape,
  intent: HouseholdIntent,
  context: ExecutionContext,
): Promise<{ ok: true; text: string; keep?: string[] } | { ok: false; reason: string }> {
  const result = corrects.result;
  switch (corrects.actionType) {
    case "add_to_list": {
      // Only what HomeTalk itself added comes off — the amount it put on the
      // list, and an item it created — and what the corrected request still
      // names stays exactly where it is.
      const wanted = new Set(itemsOf(intent).map((name) => name.toLowerCase()));
      // A record from before the shopping list names one item at the top level.
      const entries = Array.isArray(result.items)
        ? (result.items as { name?: unknown }[])
        : typeof result.consumableId === "string"
          ? [{ name: result.name, consumableId: result.consumableId, alreadyTracked: result.alreadyTracked === true }]
          : [];
      const keep = entries.map((entry) => String(entry.name ?? "")).filter((name) => wanted.has(name.toLowerCase()));
      const undoable = { ...result, items: entries.filter((entry) => !wanted.has(String(entry.name ?? "").toLowerCase())) };
      if ((undoable.items as unknown[]).length === 0) return { ok: true, text: "", keep };
      const undone = await undoAddToList(undoable, context);
      if (undone === null) return { ok: false, reason: "I could not find what I added earlier, so I left the list as it was." };
      return { ok: true, text: `Took ${joinWords(undone.map((entry) => `**${entry.name}**`))} back off the ${linkTo("/groceries?view=to-buy", "shopping list")}.`, keep };
    }
    case "set_reminder": {
      if (typeof result.notificationId !== "string") return { ok: false, reason: "I could not find the reminder I set earlier, so I left it as it was." };
      const { error } = await context.supabase.from("notifications").update({ status: "expired" }).eq("id", result.notificationId).eq("household_id", context.householdId);
      if (error) return { ok: false, reason: "I could not cancel the earlier reminder, so I left everything as it was." };
      return { ok: true, text: "Cancelled the earlier reminder." };
    }
    case "record_absence": {
      if (typeof result.memberId !== "string" || typeof result.onDate !== "string") {
        return { ok: false, reason: "I could not find the absence I noted earlier, so I left it as it was." };
      }
      await recordAvailabilityException(context.supabase, { householdId: context.householdId, memberId: result.memberId, onDate: result.onDate, available: true, reason: null });
      return { ok: true, text: `**${String(result.memberName ?? "They")}** is no longer marked away on ${describeDate(result.onDate, "", context.timezone)}.` };
    }
    case "plan_event": {
      if (typeof result.eventId !== "string") return { ok: false, reason: "I could not find the plan I put on the calendar, so I left it as it was." };
      // Cancelled, as the event's own screen cancels it — never deleted, so its guests and history stay.
      await setEventCancelled(context.supabase, { householdId: context.householdId, eventId: result.eventId, cancelled: true });
      return { ok: true, text: `Took **${String(result.title ?? "that plan")}** off the ${linkTo("/calendar", "calendar")}.` };
    }
    case "plan_meal": {
      if (typeof result.mealId !== "string") return { ok: false, reason: "I could not find the meal I planned, so I left it as it was." };
      await removeMeal(context.supabase, { householdId: context.householdId, mealId: result.mealId });
      return { ok: true, text: `Took **${String(result.name ?? "that meal")}** off the ${linkTo("/meals", "meal plan")}.` };
    }
    case "add_bill":
    case "record_bill_payment":
    case "set_bill_amount":
      return (await undoBillTalk(corrects.actionType, result, context)) ?? { ok: false, reason: "I cannot change that one from here yet, so I left it as it was." };
    default:
      return { ok: false, reason: "I cannot change that one from here yet, so I left it as it was. You can change it on its own screen." };
  }
}

/**
 * "Undo" (HomeBrain 4.0 §3.9): everything an earlier HomeTalk action wrote,
 * taken back through the same domain service a correction or a manual
 * remove uses. A change it cannot take back is said so and left alone.
 */
export async function undoExecuted(record: CorrectsRecordShape, context: ExecutionContext): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const nothing: HouseholdIntent = { action: "unknown", actorMemberId: context.actorMemberId, target: { kind: "unspecified" }, parameters: {}, confidence: 1, channel: "text", utterance: "undo" };
  const undone = await undoForCorrection(record, nothing, context);
  if (!undone.ok) return undone;
  return { ok: true, text: undone.text || "Done — taken back." };
}

async function runAgentCheck(context: ExecutionContext): Promise<ExecutionResult> {
  if (!context.actor) return { ok: false, reason: "I could not tell who was asking, so I did not run a check." };

  const summary = await runHouseholdAgents(context.supabase, context.householdId, context.actor);
  return { ok: true, text: summary.headline, result: { runId: summary.runId, executed: summary.executed, awaitingApproval: summary.awaitingApproval, refused: summary.refused } };
}

/** The things an add names — one item or several — in the household's words. */
function itemsOf(intent: HouseholdIntent): string[] {
  const raw = Array.isArray(intent.parameters.items)
    ? intent.parameters.items
    : typeof intent.parameters.items === "string"
      ? [intent.parameters.items]
      : typeof intent.parameters.item === "string"
        ? [intent.parameters.item]
        : [];
  const seen = new Set<string>();
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !seen.has(value.toLowerCase()) && (seen.add(value.toLowerCase()), true));
}

/** "Mark Asmi's worksheet complete" — the School service's own done, as a person's tap on it would be. */
async function markSchoolItemDone(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const id = String(intent.parameters.schoolItemId);
  await completeSchoolItem(context.supabase, id);
  const whose = typeof intent.parameters.childName === "string" ? `${intent.parameters.childName}'s ` : "";
  return {
    ok: true,
    text: `Marked ${whose}**${String(intent.parameters.title ?? "that")}** done. See ${linkTo("/school", "Kids & School")}.`,
    result: { schoolItemId: id, title: intent.parameters.title ?? null },
  };
}

/**
 * "Move Manan's science project to Friday" — the item's due day changes,
 * keeping what was known about its time (14-014): a timed item keeps its
 * local start and its length, an all-day item stays all-day, and nothing
 * gets a time nobody gave.
 */
async function moveSchoolItem(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const id = String(intent.parameters.schoolItemId);
  const day = intent.parameters.toResolved as { date?: string; label?: string } | undefined;
  if (!day?.date) return { ok: false, reason: "Which day should it move to?" };
  const dueAt = typeof intent.parameters.dueAt === "string" ? new Date(intent.parameters.dueAt) : null;
  const endsAt = typeof intent.parameters.endsAt === "string" ? new Date(intent.parameters.endsAt) : null;
  const previous = { dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null, dueTimeKnown: intent.parameters.dueTimeKnown !== false, endsAt };
  await updateSchoolItem(context.supabase, context.householdId, id, movedSchoolWhen(previous, day.date, context.timezone));
  const whose = typeof intent.parameters.childName === "string" ? `${intent.parameters.childName}'s ` : "";
  return {
    ok: true,
    text: `Moved ${whose}**${String(intent.parameters.title ?? "that")}** to ${(day.label ?? day.date).replace(/^on /, "")}. See ${linkTo("/school", "Kids & School")}.`,
    result: { schoolItemId: id, dueOn: day.date },
  };
}

/**
 * "The washing machine is making that noise again" — a service request on
 * record, against the appliance where the household has it listed. Logged,
 * not dispatched: nobody is contacted until the household chooses who.
 */
async function raiseServiceRequest(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const assetName = String(intent.parameters.assetName);
  const symptom = typeof intent.parameters.symptom === "string" ? intent.parameters.symptom : null;
  const subject = `${assetName}${symptom ? ` ${symptom}` : " needs a look"}`.slice(0, 200);
  const { id } = await createServiceRequest(context.supabase, {
    householdId: context.householdId,
    assetId: typeof intent.parameters.assetId === "string" ? intent.parameters.assetId : null,
    subject: subject.charAt(0).toUpperCase() + subject.slice(1),
    nextAction: "Choose who to call",
    nextActionBy: "household",
  });
  const listed = typeof intent.parameters.assetId === "string" ? "" : ` The ${assetName.toLowerCase()} is not on your list of appliances yet, so it is logged by name.`;
  return {
    ok: true,
    text: `Logged a service request for the **${assetName.toLowerCase()}**. Nobody has been contacted — choose who to call under ${linkTo("/household/home", "Home & Upkeep")}.${listed}`,
    result: { serviceRequestId: id, assetName, ...(typeof intent.parameters.assetId === "string" ? { assetId: intent.parameters.assetId } : {}) },
  };
}

/**
 * "Protect Saturday evening for family time" — a real block on the family
 * calendar through HomeEvents (`addFamilyEvent`), protected and owned by the person who
 * asked (protected time always has an owner).
 */
async function putOnCalendar(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const resolved = (intent.parameters.windowResolved ?? intent.parameters.whenResolved) as { date?: string; window?: { from: string; to: string } | null; label?: string; precision?: string } | undefined;
  if (!resolved?.date) return { ok: false, reason: "Which day is it for?" };
  const protectedTime = intent.parameters.protected === true;
  const span = resolved.window ?? (protectedTime ? { from: "09:00", to: "21:00" } : null);
  if (!span) return { ok: false, reason: notYetDoable("plan_event") };
  const clock = (value: string) => ({ hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) });
  const from = clock(span.from);
  const to = clock(span.to);
  const what = String(intent.parameters.what ?? "Family time").trim();
  const title = what.charAt(0).toUpperCase() + what.slice(1);
  const label = (resolved.label ?? resolved.date).replace(/\s*\(.*\)$/, "");
  // Through HomeEvents' one door: already on the calendar that day, under this
  // or another name — a family event or a school entry — is said back, never
  // added a second time.
  const added = await addFamilyEvent(
    context.supabase,
    {
      householdId: context.householdId,
      title,
      kind: /family|together/i.test(what) ? "family_time" : "outing",
      startsAt: zonedTimeToUtcIso(resolved.date, from.hour, from.minute, context.timezone),
      endsAt: zonedTimeToUtcIso(resolved.date, to.hour, to.minute, context.timezone),
      protected: protectedTime,
      ownerMemberId: context.actorMemberId,
    },
    { timeZone: context.timezone },
  );
  if (added.kind === "duplicate") {
    const existing = added.existing;
    return {
      ok: true,
      text: `**${existing.title}** is already on the family calendar ${onDay(label)}, so nothing was added. See ${linkTo("/calendar", "Calendar")}.`,
      result: { alreadyTracked: true, existingId: existing.sourceId, existingTitle: existing.title },
    };
  }
  const id = added.id;
  const hours = `${formatHourMinute(from.hour, from.minute)}–${formatHourMinute(to.hour, to.minute)}`;
  return {
    ok: true,
    text: protectedTime
      ? `${label.charAt(0).toUpperCase()}${label.slice(1)}, ${hours}, is now kept free for **${what}** on the family calendar. See ${linkTo("/family", "Family")}.`
      : `Put **${what}** on the family calendar ${onDay(label)}, ${hours}. See ${linkTo("/family", "Family")}.`,
    result: { eventId: id, title, protected: protectedTime },
  };
}

/** A stored instant as the household's own clock time. */
function localClock(iso: string, timezone: string): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).formatToParts(new Date(iso));
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? { hour: hour % 24, minute } : null;
  } catch {
    return null;
  }
}

/** "tomorrow (Thu 24 Sep)" reads as it is; a bare date reads "on Fri 25 Sep". */
function onDay(label: string): string {
  return /^(?:today|tonight|tomorrow|yesterday|this|next|day after)\b/i.test(label) ? label : `on ${label}`;
}

/** When a meal of the day is usually ready, local time: the family's "by when". */
const READY_BY: Record<MealSlot, { hour: number; minute: number }> = {
  breakfast: { hour: 8, minute: 0 },
  lunch: { hour: 13, minute: 0 },
  snack: { hour: 17, minute: 0 },
  dinner: { hour: 20, minute: 0 },
};

/**
 * "Plan pasta for tonight" — a real meal on the household's plan, through
 * the same `createMeal` the Meals screen uses, with its recipe's
 * ingredients copied on where the household has a recipe for it.
 */
async function planMeal(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const day = (intent.parameters.windowResolved ?? intent.parameters.whenResolved) as { date?: string; label?: string } | undefined;
  if (!day?.date) return { ok: false, reason: "Which day should I plan it for?" };
  const slot = (["breakfast", "lunch", "snack", "dinner"].includes(String(intent.parameters.slot)) ? intent.parameters.slot : "dinner") as MealSlot;
  const raw = String(intent.parameters.mealName ?? intent.parameters.what ?? "").trim();
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (!name) return { ok: false, reason: "What should I plan?" };
  let recipeId = typeof intent.parameters.recipeId === "string" ? intent.parameters.recipeId : null;
  // A dish from WonderHome's catalog (25-022) is saved as the household's own recipe first, so the meal knows what it needs.
  let fromCatalog = false;
  if (!recipeId && typeof intent.parameters.catalogSlug === "string") {
    const { saveCatalogRecipe } = await import("../meals/catalog-copy");
    const saved = await saveCatalogRecipe(context.supabase, { householdId: context.householdId, slug: intent.parameters.catalogSlug, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" }).catch(() => null);
    if (saved) {
      recipeId = saved.recipeId;
      fromCatalog = saved.created;
    }
  }
  const ready = READY_BY[slot];

  const { id } = await createMeal(context.supabase, {
    householdId: context.householdId,
    name,
    slot,
    onDate: day.date,
    readyBy: zonedTimeToUtcIso(day.date, ready.hour, ready.minute, context.timezone),
    recipeId,
  });
  const attached = recipeId ? (await attachIngredients(context.supabase, context.householdId, id, recipeId)).attached : 0;

  const when = day.label ? day.label.replace(/^on /, "") : describeDate(day.date, "", context.timezone);
  const meals = linkTo("/meals", "Meals");
  const ingredients = recipeId
    ? fromCatalog
      ? ` I used WonderHome's recipe for it and saved it under your recipes, where you can change it; its ${attached} ingredient${attached === 1 ? " is" : "s are"} on the meal.`
      : attached > 0
      ? ` Its recipe's ${attached} ingredient${attached === 1 ? " is" : "s are"} on the meal, so I can check them against the list.`
      : " Its recipe has no ingredients listed yet."
    : ` There is no recipe for it on record, so I do not know what it needs — add one under ${meals} and I can check next time.`;
  return {
    ok: true,
    text: `Planned **${name}** for ${slot} ${/^(?:today|tonight|tomorrow|this|next)\b/.test(when) ? when : `on ${when}`}.${ingredients} See ${meals}.`,
    result: { mealId: id, name, slot, onDate: day.date, recipeId, ingredients: attached },
  };
}

/**
 * "Remind me to buy them tomorrow" — a real reminder, to the speaker only:
 * a notification addressed to them and held until its time, when it shows
 * under Notifications. Nobody else is told anything.
 */
async function setReminder(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  if (!context.admin) return { ok: false, reason: "I could not set a reminder just now." };
  const now = context.now ?? new Date();
  const when = String(intent.parameters.when ?? "");
  const moment = reminderMoment(when, typeof intent.parameters.time === "string" ? intent.parameters.time : null, { timezone: context.timezone, now });
  if (!moment.ok) return { ok: false, reason: moment.question };
  const due = moment.at;

  const what = String(intent.parameters.what ?? "").trim().replace(/[.!]+$/, "");
  const title = `Reminder: ${what.charAt(0).toUpperCase()}${what.slice(1)}`.slice(0, 160);
  const { data, error } = await context.admin
    .from("notifications")
    .insert({
      household_id: context.householdId,
      recipient_member_id: context.actorMemberId,
      type: "action",
      priority: "normal",
      thread_key: `reminder:${crypto.randomUUID()}`,
      title,
      body: `You asked HomeTalk to remind you ${onDay(moment.day.replace(/\s*\(.*\)$/, ""))} at ${moment.time}.`.slice(0, 500),
      action: null,
      decision_factors: { source: "home_talk", requestedBy: context.actorMemberId, phrase: when },
      scheduled_for: due.toISOString(),
      // A person's own reminder: snoozed, dismissed and delivered like any
      // other (module 23), with no record behind it to resolve it.
      category: "system",
      source_type: "reminder",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: "I could not set that reminder just now, and nothing was saved." };

  const whenText = `${onDay(moment.day)} at ${moment.time}`;
  return {
    ok: true,
    text: `I will remind you ${whenText} to **${what}**. It will show under ${linkTo("/notifications", "Notifications")} then — only you will see it.`,
    result: { notificationId: (data as { id: string }).id, what, remindAt: due.toISOString() },
  };
}

async function recordAbsence(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const reference = intent.target.reference ?? "";
  const memberId = typeof intent.parameters.memberId === "string" ? intent.parameters.memberId : null;
  // A model that already mapped the reference to a member is trusted only as
  // far as that id is someone in this household; otherwise the context
  // engine resolves "Sunita", "Dad" or "the helper" — and asks rather than
  // guesses when it cannot tell.
  let member = context.members.find((entry) => entry.id === memberId);
  if (!member) {
    const resolution = resolvePerson(reference, personItems(context.members, { householdId: context.householdId, now: context.now ?? new Date() }), { viewerMemberId: context.actorMemberId });
    member = resolution.selected ? context.members.find((entry) => entry.id === resolution.selected!.memberId) : undefined;
    if (!member) {
      if (resolution.ambiguous) return { ok: false, reason: resolution.question ?? "Who did you mean?" };
      const suggestion = resolution.candidates[0] ? ` ${resolution.question}` : " Who did you mean?";
      return { ok: false, reason: `I do not know anyone called “${reference}” in this household.${suggestion}` };
    }
  }

  const when = typeof intent.parameters.when === "string" ? intent.parameters.when : "today";
  const onDate = resolveWhen(when, context.now ?? new Date(), context.timezone);
  if (!onDate) return { ok: false, reason: `Which day is ${member.displayName} away? Say “today”, “tomorrow” or a day of the week.` };

  await recordAvailabilityException(context.supabase, {
    householdId: context.householdId,
    memberId: member.id,
    onDate,
    available: false,
    reason: null,
  });

  return {
    ok: true,
    text: `Noted — **${member.displayName}** is away ${describeDate(onDate, when, context.timezone)}. I will re-check what they usually handle that day; see ${linkTo("/family", "Family")}.`,
    result: { memberId: member.id, memberName: member.displayName, onDate },
  };
}

/**
 * "I have a dentist appointment next Tuesday at 4" — books a real
 * appointment via the same governed `createAppointment` the booking wizard
 * uses. Always for the speaker themselves: nothing in this rule set names a
 * third party, and `createAppointment`'s own RLS would refuse it anyway
 * unless the speaker is that person's guardian.
 */
async function recordHealthAppointment(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const appointmentType = (typeof intent.parameters.appointmentType === "string" ? intent.parameters.appointmentType : "other") as AppointmentType;
  const typeText = typeof intent.parameters.typeText === "string" && intent.parameters.typeText.trim() ? intent.parameters.typeText.trim() : appointmentType;

  const when = typeof intent.parameters.when === "string" ? intent.parameters.when : null;
  if (!when) return { ok: false, reason: `Which day is the ${typeText} appointment? Say "today", "tomorrow" or a day of the week.` };
  const onDate = resolveWhen(when, context.now ?? new Date(), context.timezone);
  if (!onDate) return { ok: false, reason: `Which day is the ${typeText} appointment? Say "today", "tomorrow" or a day of the week.` };

  const timeText = typeof intent.parameters.time === "string" ? intent.parameters.time : null;
  const time = timeText ? parseTimeOfDay(timeText) : null;
  if (!time) return { ok: false, reason: `What time is the ${typeText} appointment on ${describeDate(onDate, when, context.timezone)}?` };

  const member = context.members.find((entry) => entry.id === context.actorMemberId);
  if (!member) return { ok: false, reason: "I could not tell who was asking, so I did not book anything." };

  const startsAt = zonedTimeToUtcIso(onDate, time.hour, time.minute, context.timezone);

  const { appointment, conflicts } = await createAppointment(
    context.supabase,
    { householdId: context.householdId, memberId: context.actorMemberId },
    {
      memberId: context.actorMemberId,
      memberDisplayName: member.displayName,
      appointmentType,
      privacyScope: "private",
      startsAt,
    },
  );

  const conflictNote = conflicts.length > 0 ? " That overlaps with something else on your calendar — worth a look." : "";
  return {
    ok: true,
    text: `Booked — a ${typeText} appointment ${describeDate(onDate, when, context.timezone)} at ${formatHourMinute(time.hour, time.minute)}. See ${linkTo("/health", "Health & Fitness")}.${conflictNote}`,
    result: { appointmentId: appointment.id, appointmentType, startsAt },
  };
}

/**
 * "I've had a headache since yesterday" — a real, private-by-default health
 * issue, never a diagnosis (the domain's own `createIssue` decides only
 * whether the wording suggests medical attention, and only says so, never
 * acts on it).
 */
async function logHealthIssue(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const label = typeof intent.parameters.label === "string" ? intent.parameters.label.trim() : "";
  if (!label) return { ok: false, reason: "What would you like me to note?" };

  const since = typeof intent.parameters.since === "string" ? intent.parameters.since : null;
  const startedAt = since ? (resolveWhen(since, context.now ?? new Date(), context.timezone) ?? undefined) : undefined;

  const { issue, medicalAttention } = await createIssue(
    context.supabase,
    { householdId: context.householdId, memberId: context.actorMemberId },
    { memberId: context.actorMemberId, label: capitalize(label), privacyScope: "private", startedAt },
  );

  const advisory = medicalAttention.recommend ? ` ${medicalAttention.message}` : "";
  return {
    ok: true,
    text: `Noted — ${label}, private to you unless you choose to share it. See ${linkTo("/health", "Health & Fitness")}.${advisory}`,
    result: { issueId: issue.id, label },
  };
}

/**
 * "My headache is gone" — resolves the matching open issue, found by a
 * loose label match against the speaker's own open issues (RLS already
 * scopes the list to what they may see). No match is an honest "I do not
 * have that on record", never a guess at which issue was meant.
 */
async function resolveHealthIssue(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const label = typeof intent.parameters.label === "string" ? intent.parameters.label.trim().toLowerCase() : "";
  if (!label) return { ok: false, reason: "What would you like me to mark resolved?" };

  const open = await listIssues(context.supabase, context.householdId, {
    memberId: context.actorMemberId,
    statuses: ["mentioned", "active", "monitoring"],
  });
  const now = context.now ?? new Date();
  const items = buildContextItems({ healthIssues: open }, { householdId: context.householdId, householdName: "", timezone: context.timezone, now, viewerMemberId: context.actorMemberId });
  const resolution = resolveEntity(label, items, { timezone: context.timezone, now, entityTypes: ["health_issue"] });
  if (resolution.ambiguous) return { ok: false, reason: resolution.question ?? "Which one did you mean?" };
  const match = resolution.selected ? open.find((issue) => issue.id === resolution.selected!.entityId) : undefined;
  if (!match) {
    return { ok: false, reason: `I do not have an open record of "${label}" for you — check ${linkTo("/health", "Health & Fitness")} to see what is tracked.` };
  }

  await setIssueStatus(context.supabase, { householdId: context.householdId, memberId: context.actorMemberId }, match.id, "resolved");
  return {
    ok: true,
    text: `Good to hear — marked **${match.label}** resolved. See ${linkTo("/health", "Health & Fitness")}.`,
    result: { issueId: match.id },
  };
}

/**
 * "My BP was 128 over 82 this morning" — a real vital reading (story
 * 21-007), through the same `createVital` the Health & Fitness screen's own
 * form calls. Never invents a unit: blood pressure, pulse and steps have
 * one conventional unit each (mmHg, bpm, steps) and this uses it; every
 * other vital type (weight, height, temperature, distance…) is genuinely
 * ambiguous between systems of measurement, so a reading with no unit word
 * in it is declined rather than guessed — the honest reason names exactly
 * what to say instead ("72 kg", not just "72").
 */
async function logVital(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const vitalWord = typeof intent.parameters.vital === "string" ? intent.parameters.vital : "";
  const reading = typeof intent.parameters.reading === "string" ? intent.parameters.reading : "";
  const parsed = parseVitalReading(vitalWord, reading);

  if (!parsed) {
    return {
      ok: false,
      reason: `I heard "${reading}", but could not pick a clear value and unit out of that — try again with a unit (e.g. "72 kg", "128 over 82"), or add it under ${linkTo("/health", "Health & Fitness")} yourself.`,
    };
  }

  const vital = await createVital(
    context.supabase,
    { householdId: context.householdId, memberId: context.actorMemberId },
    {
      memberId: context.actorMemberId,
      vitalType: parsed.vitalType,
      customLabel: parsed.vitalType === "custom" ? capitalize(vitalWord) : undefined,
      value: parsed.value,
      secondaryValue: parsed.secondaryValue ?? null,
      unit: parsed.unit,
      privacyScope: "private",
      sourceType: "home_talk",
    },
  );

  const valueText = parsed.secondaryValue != null ? `${parsed.value}/${parsed.secondaryValue} ${parsed.unit}` : `${parsed.value} ${parsed.unit}`;
  return {
    ok: true,
    text: `Noted — ${valueText}. See ${linkTo("/health", "Health & Fitness")}.`,
    result: { vitalId: vital.id, vitalType: parsed.vitalType },
  };
}

/**
 * "I want to walk three times a week" — a real, consistency-oriented goal
 * (story 21-008) via the same `createFitnessGoal` the Health & Fitness
 * screen's own form calls. Never scored, never a leaderboard entry — the
 * reply states the goal back, nothing more.
 */
async function setFitnessGoal(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const activityText = typeof intent.parameters.activity === "string" ? intent.parameters.activity.trim() : "";
  const count = typeof intent.parameters.count === "number" ? intent.parameters.count : 0;
  const timesPer = intent.parameters.timesPer;

  if (!activityText || count <= 0 || (timesPer !== "day" && timesPer !== "week" && timesPer !== "month")) {
    return { ok: false, reason: "What would you like the goal to be, and how often?" };
  }

  const { activityType, customLabel } = mapFitnessActivity(activityText);

  const goal = await createFitnessGoal(
    context.supabase,
    { householdId: context.householdId, memberId: context.actorMemberId },
    {
      memberId: context.actorMemberId,
      activityType,
      customLabel,
      targetCount: count,
      frequencyPeriod: timesPer as FitnessFrequencyPeriod,
      privacyScope: "private",
      providerId: "home_talk",
    },
  );

  const label = (activityType === "other" ? customLabel : FITNESS_ACTIVITY_LABEL[activityType]) ?? activityText;
  return {
    ok: true,
    text: `Goal set — ${label.toLowerCase()} ${count} time${count === 1 ? "" : "s"} a ${timesPer}. See ${linkTo("/health", "Health & Fitness")}.`,
    result: { goalId: goal.id, activityType },
  };
}

const ACTIVITY_KEYWORDS: [RegExp, FitnessActivityType][] = [
  [/\b(walks?|walking)\b/, "walk"],
  [/\b(runs?|running|jog(?:ging)?)\b/, "run"],
  [/\b(cycl(?:e|ing)|bik(?:e|ing))\b/, "cycle"],
  [/\bswim(?:ming)?\b/, "swim"],
  [/\byoga\b/, "yoga"],
  [/\b(strength training|weights?|weightlifting|lifting|gym)\b/, "strength_training"],
  [/\b(stretch(?:es|ing)?)\b/, "stretching"],
  [/\b(sports?|football|basketball|tennis|soccer|cricket|badminton)\b/, "sports"],
];

/** Free text ("walk", "go for a run", "play tennis") → a known activity type, or `other` with the household's own words kept as the label. */
export function mapFitnessActivity(text: string): { activityType: FitnessActivityType; customLabel: string | null } {
  const normalized = text.trim().toLowerCase();
  for (const [pattern, activityType] of ACTIVITY_KEYWORDS) {
    if (pattern.test(normalized)) return { activityType, customLabel: null };
  }
  return { activityType: "other", customLabel: capitalize(text.trim()) };
}

const VITAL_WORD_TO_TYPE: Record<string, VitalType> = {
  "blood pressure": "blood_pressure",
  bp: "blood_pressure",
  weight: "weight",
  "heart rate": "pulse",
  pulse: "pulse",
  temperature: "temperature",
  "blood sugar": "custom",
  sugar: "custom",
};

/** A unit this vital type always uses — never guessed for a type where the household's own system of measurement (metric vs imperial) is genuinely ambiguous. */
const CANONICAL_UNIT: Partial<Record<VitalType, string>> = {
  blood_pressure: "mmHg",
  pulse: "bpm",
  steps: "steps",
};

type ParsedVital = { vitalType: VitalType; value: number; secondaryValue?: number; unit: string };

export function parseVitalReading(vitalWord: string, reading: string): ParsedVital | null {
  const vitalType = VITAL_WORD_TO_TYPE[vitalWord];
  if (!vitalType) return null;

  const text = reading.trim().toLowerCase();

  if (vitalType === "blood_pressure") {
    const match = text.match(/(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/);
    if (!match) return null;
    return { vitalType, value: Number(match[1]), secondaryValue: Number(match[2]), unit: "mmHg" };
  }

  const match = text.match(/^(\d+(?:\.\d+)?)\s*([a-z%]*)/);
  if (!match) return null;
  const value = Number(match[1]);
  const explicitUnit = match[2]?.trim();

  if (explicitUnit) return { vitalType, value, unit: explicitUnit };

  const canonical = CANONICAL_UNIT[vitalType];
  return canonical ? { vitalType, value, unit: canonical } : null;
}

/** A wall-clock date + hour/minute, read in `timeZone`, as a UTC ISO instant — the "guess, then correct by the zone's own offset" technique, correct across DST. */
export function zonedTimeToUtcIso(isoDate: string, hour: number, minute: number, timeZone: string): string {
  const naive = new Date(`${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
  const offsetMinutes = timezoneOffsetMinutes(naive, timeZone);
  return new Date(naive.getTime() - offsetMinutes * 60_000).toISOString();
}

function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? "0");
    const hour = get("hour") === 24 ? 0 : get("hour");
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
    return (asUtc - date.getTime()) / 60_000;
  } catch {
    return 0;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * One local day for a phrase — today, tomorrow, "next Friday", "tomorrow
 * after school" — through the one temporal resolver (Wave 4 §7), so every
 * write and every reply agree on what a phrase means. A range ("next week")
 * is not one day: null, and the caller asks.
 */
export function resolveWhen(when: string, now: Date, timezone: string): string | null {
  return resolveDay(when.trim() === "" ? "today" : when, { timezone, now });
}

function describeDate(isoDate: string, when: string, timezone: string): string {
  const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${isoDate}T12:00:00Z`));
  const word = when.trim().toLowerCase();
  void timezone;
  return word === "today" || word === "tomorrow" ? `${word} (${label})` : `on ${label}`;
}
