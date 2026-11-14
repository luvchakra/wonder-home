import type { SupabaseClient } from "@supabase/supabase-js";

import type { PendingClarification } from "../conversation/clarify";
import { openSession, recordMessage, type ConversationSurface } from "../conversation/repository";
import { updateConsumable } from "../commerce/repository";
import { updateObligation } from "../finance/repository";
import { RECORD_TYPES, updateRecord, type RecordType } from "../health/records";
import { confirmHomeSendEntry } from "../homesend/changes";
import {
  afterAnswer,
  askCorrection,
  CHECK_LABELS,
  checkedScore,
  readCheckingState,
  questionsLeft,
  readValue,
  splitCheckAnswer,
  startChecking,
  type CheckChannel,
  type CheckingState,
  type CheckMode,
  type CheckOutcome,
} from "../homesend/checking";
import type { CompletenessReading, DetailField } from "../homesend/completeness";
import { detectInstructionInjection } from "../homesend/injection";
import type { HomeSendKind } from "../homesend/items";
import { shortDate } from "../homesend/reconcile";
import type { ReadingCheck } from "../homesend/verify";
import { en } from "../i18n/messages/en";
import { translator, type Translate, type TranslationKey } from "../i18n/translate";
import { updateSchoolItem } from "../school/repository";
import { schoolWhen } from "../school/times";
import { choicesFor } from "./choices";
import { readDetailAnswer } from "./detail-answers";
import { DETAIL_QUESTIONS, questionIn, secondAsk } from "./intake-questions";
import type { QuestionCadence } from "./question-cadence";

/**
 * HomeTalk's questions about an entry HomeSend added as "Checking" (the
 * owner, 2026-11-03; story 14-061). HomeSend plans them from evidence
 * (`homesend/checking.ts`); HomeTalk, the one door (rule 13), asks them, one
 * at a time, in the app and on WhatsApp, and reads each answer through the
 * conversation engine's own clarify machinery (action `check_homesend_entry`).
 *
 * One question, two channels: the state is the item's own
 * (`home_send_items.understanding.checking`), so an answer in either channel
 * moves it on for both, and a stale copy is told it is already answered.
 *
 * An answer is read by HomeTalk's deterministic detail readers, never by a
 * model, so nothing a model wrote reaches the record. It is applied in place
 * through the domain's own update, as the member (their own client; RLS
 * decides), on the one record this item added. Only the item's sender is
 * asked and may answer (decision C). Text that tries to instruct WonderHome
 * is never applied (`injection.ts`). An answer never approves a payment,
 * changes a permission or reaches another item or household: the item comes
 * from the question's own parameters and is read inside the caller's
 * household.
 */

export const CHECK_ACTION = "check_homesend_entry";

export type ItemRow = {
  id: string;
  status: string;
  classified_kind: HomeSendKind | null;
  extracted: Record<string, unknown> | null;
  understanding: Record<string, unknown> | null;
  routed_table: string | null;
  routed_id: string | null;
  created_by_member_id: string | null;
};

async function loadItem(client: SupabaseClient, householdId: string, itemId: string): Promise<ItemRow | null> {
  const { data } = await client
    .from("home_send_items")
    .select("id, status, classified_kind, extracted, understanding, routed_table, routed_id, created_by_member_id")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .maybeSingle();
  return (data as ItemRow | null) ?? null;
}

async function saveState(client: SupabaseClient, item: ItemRow, householdId: string, state: CheckingState, extracted?: Record<string, unknown>): Promise<boolean> {
  const { error } = await client
    .from("home_send_items")
    .update({ understanding: { ...(item.understanding ?? {}), checking: state }, ...(extracted ? { extracted } : {}) })
    .eq("household_id", householdId)
    .eq("id", item.id);
  return !error;
}

/**
 * Plans the questions for an entry just added as Checking and keeps them on
 * the item. Null when there is nothing to ask (it then waits on "Looks
 * right" or Undo, as before). Never throws: a failure here never undoes the add.
 */
export async function beginChecking(
  client: SupabaseClient,
  input: { householdId: string; itemId: string; recipientMemberId: string; score: number | null; percent: number },
): Promise<CheckingState | null> {
  try {
    const item = await loadItem(client, input.householdId, input.itemId);
    if (!item?.classified_kind) return null;
    const already = readCheckingState(item.understanding?.checking);
    if (already) return already;
    const state = startChecking({
      kind: item.classified_kind,
      extracted: (item.extracted ?? null) as CompletenessReading,
      check: (item.understanding?.check ?? null) as ReadingCheck | null,
      recipientMemberId: input.recipientMemberId,
      score: input.score,
      percent: input.percent,
    });
    if (!state) return null;
    return (await saveState(client, item, input.householdId, state)) ? state : null;
  } catch {
    return null;
  }
}

// --- Words -----------------------------------------------------------------------------

const LABEL_KEYS: Partial<Record<DetailField, TranslationKey>> = {
  name: "whatsapp.check.label.name",
  quantity: "whatsapp.check.label.quantity",
  title: "whatsapp.check.label.title",
  dueDate: "whatsapp.check.label.dueDate",
  className: "whatsapp.check.label.className",
  date: "whatsapp.check.label.date",
  time: "whatsapp.check.label.time",
  where: "whatsapp.check.label.where",
  payee: "whatsapp.check.label.payee",
  amount: "whatsapp.check.label.amount",
  recordType: "whatsapp.check.label.recordType",
  merchant: "whatsapp.check.label.merchant",
};

/** What was read, as a person would say it: "10 Nov", "₹2,140", "lab result". */
export function shownValue(kind: HomeSendKind, field: DetailField, extracted: CompletenessReading): string | null {
  const value = readValue(kind, field, extracted);
  if (value === null) return null;
  if (field === "amount" && typeof value === "number") {
    const currency = typeof (extracted as Record<string, unknown> | null)?.currency === "string" ? String((extracted as Record<string, unknown>).currency) : "";
    const sign = currency.toUpperCase() === "INR" || !currency ? "₹" : `${currency} `;
    return `${sign}${value.toLocaleString("en-IN")}`;
  }
  if (field === "dueDate" || field === "date") return shortDate(String(value)) ?? String(value);
  if (field === "recordType") return String(value).replace(/_/g, " ");
  return String(value);
}

/** "Electricity · ₹2,140 · 12 Nov": each key detail the reading holds, in the order a person knows it by. */
export function readingSummary(kind: HomeSendKind, extracted: CompletenessReading): string | null {
  if (kind === "unknown") return null;
  const fields = SUMMARY_FIELDS[kind];
  const values = fields.map((field) => shownValue(kind, field, extracted)).filter((value): value is string => Boolean(value));
  const unique = values.filter((value, index) => values.indexOf(value) === index);
  return unique.length > 0 ? unique.join(" · ") : null;
}

const SUMMARY_FIELDS: Record<Exclude<HomeSendKind, "unknown">, readonly DetailField[]> = {
  grocery_item: ["name", "quantity"],
  school_item: ["title", "dueDate"],
  activity_item: ["className", "date"],
  event: ["title", "date"],
  bill: ["payee", "amount", "dueDate"],
  health_document: ["recordType", "date"],
  receipt: ["merchant", "date"],
};

/**
 * The question, in English (inside a HomeTalk turn, which answers in the
 * member's language) or through `t` (said outside a turn, on WhatsApp). A
 * confirm says the value back: decision C allows it, to the item's sender only.
 */
export function checkQuestionText(kind: HomeSendKind, open: { field: DetailField; mode: CheckMode }, extracted: CompletenessReading, t?: Translate): string {
  const english = !t;
  // One "Looks right?" over everything read from a photo or file (14-066, part 3).
  if (open.mode === "confirm_all") {
    const summary = readingSummary(kind, extracted);
    if (summary) return english ? `Here's what I read: **${summary}**. Looks right?` : t("whatsapp.check.confirmAll", { summary });
  }
  const value = shownValue(kind, open.field, extracted);
  const label = english ? CHECK_LABELS[open.field] : t(LABEL_KEYS[open.field] ?? "whatsapp.check.label.title");
  if (open.mode === "confirm" && value) {
    const whole = open.field === "name" || open.field === "title";
    if (english) return whole ? `Did I get it right: **${value}**?` : `Did I get the ${label} right: **${value}**?`;
    return whole ? t("whatsapp.check.confirmIt", { value }) : t("whatsapp.check.confirm", { label, value });
  }
  // "No": HomeTalk's own question for the detail, as it asks before an add ("How much is the bill?").
  if (english) return DETAIL_QUESTIONS[open.field];
  return questionIn(t, kind, { field: open.field, question: DETAIL_QUESTIONS[open.field], clarify: { action: CHECK_ACTION, target: { kind: "unspecified" }, parameters: {}, question: "", utterance: "", asked: 1 } });
}

function clarifyFor(item: ItemRow, state: CheckingState, question: string, via: CheckChannel): PendingClarification {
  const open = state.open!;
  const title = typeof item.extracted?.title === "string" ? item.extracted.title : null;
  return {
    action: CHECK_ACTION,
    target: { kind: "unspecified" },
    parameters: { itemId: item.id, kind: item.classified_kind, field: open.field, mode: open.mode, ordinal: open.ordinal, via, ...(title ? { title } : {}), ...(open.retried ? { retried: true } : {}) },
    question,
    utterance: "",
    asked: open.ordinal,
  };
}

/** The question waiting on an item, for this member, with its clarify; null when nothing waits or it isn't theirs. */
export async function currentCheckQuestion(
  client: SupabaseClient,
  input: { householdId: string; itemId: string; memberId: string; via: CheckChannel; t?: Translate },
): Promise<{ text: string; clarify: PendingClarification; title: string | null } | null> {
  const item = await loadItem(client, input.householdId, input.itemId).catch(() => null);
  const state = readCheckingState(item?.understanding?.checking);
  if (!item?.classified_kind || !state?.open || state.done || state.recipientMemberId !== input.memberId) return null;
  const text = checkQuestionText(item.classified_kind, state.open, (item.extracted ?? null) as CompletenessReading, input.t);
  const title = typeof item.extracted?.title === "string" ? item.extracted.title : null;
  return { text, clarify: clarifyFor(item, state, text, input.via), title };
}

/**
 * Asks the open question in the member's conversation on `surface`, outside a
 * HomeTalk turn (a WhatsApp item just added as Checking): recorded as
 * HomeTalk's reply, open for the next turn, with the answers to pick. Returns
 * its words, or null when nothing is waiting.
 */
export async function openCheckQuestion(
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; itemId: string; surface: ConversationSurface; t?: Translate; lead?: string; cadence?: QuestionCadence },
): Promise<string | null> {
  const via: CheckChannel = input.surface === "whatsapp" ? "whatsapp" : "hometalk";
  const t = input.t ?? translator("en", en);
  const [current, others] = await Promise.all([
    currentCheckQuestion(admin, { householdId: input.householdId, itemId: input.itemId, memberId: input.memberId, via, t }),
    waitingChecks(admin, { householdId: input.householdId, memberId: input.memberId, excludeItemId: input.itemId }).catch(() => []),
  ]);
  if (!current) return null;
  // Several waiting are one run, said once (14-066, part 3): "3 quick ones — first, Electricity:".
  const count = 1 + countWaiting(others);
  const lead = input.lead ?? (count > 1 ? t("whatsapp.check.leadMany", { count, title: current.title ?? "" }) : t("whatsapp.check.lead", { title: current.title ?? "" }));
  const said = lead ? `${lead}\n${current.text}` : current.text;
  const [{ data: household }, sessionId] = await Promise.all([
    admin.from("households").select("timezone").eq("id", input.householdId).maybeSingle(),
    openSession(admin, { householdId: input.householdId, memberId: input.memberId, channel: "text", surface: input.surface }),
  ]);
  const timezone = (household as { timezone?: string | null } | null)?.timezone ?? "UTC";
  const choices = choicesFor(current.clarify, { t, now: new Date(), timezone });
  await recordMessage(admin, {
    householdId: input.householdId,
    sessionId,
    role: "assistant",
    content: said,
    metadata: { proposal: "clarify", intent: CHECK_ACTION, mode: "clarify", clarify: current.clarify, ...(choices ? { choices } : {}), ...(input.cadence ? { cadence: input.cadence } : {}) },
  });
  return said;
}

// --- Answering -------------------------------------------------------------------------

export type CheckAnswer = {
  text: string;
  /** The next question, open for the next turn; null when it ended or nothing is asked. */
  clarify: PendingClarification | null;
  /** Over the bar now: confirmed, its reminders released. */
  confirmed?: true;
  /** What happened, for the audit trail and tests. */
  outcome?: CheckOutcome | "refused" | "stale" | "ignored" | "corrected_later";
};

const VIA_WORDS: Record<CheckChannel, string> = { hometalk: "in HomeTalk", whatsapp: "on WhatsApp" };

/**
 * Applies an answer to the open question about an entry still Checking.
 * `parameters` is the question's own clarify; the item is read in the
 * caller's household through their own client, so another household's item
 * is never found.
 */
export async function answerCheckQuestion(
  client: SupabaseClient,
  input: { householdId: string; actorMemberId: string; parameters: Record<string, unknown>; answer: string; timezone: string; now: Date },
): Promise<CheckAnswer> {
  const itemId = typeof input.parameters.itemId === "string" ? input.parameters.itemId : "";
  const via: CheckChannel = input.parameters.via === "whatsapp" ? "whatsapp" : "hometalk";
  const item = itemId ? await loadItem(client, input.householdId, itemId).catch(() => null) : null;
  const state = readCheckingState(item?.understanding?.checking);
  if (!item || !item.classified_kind || !state) return { text: "That one isn't being checked any more, so there's nothing to change.", clarify: null, outcome: "stale" };
  const kind = item.classified_kind;
  const title = typeof item.extracted?.title === "string" ? item.extracted.title : "it";

  // Only the person who sent it in is asked, and only they answer (decision C).
  if (state.recipientMemberId !== input.actorMemberId) return { text: "That question was for the person who sent it in, so I've left it as it is.", clarify: null, outcome: "refused" };

  // Already answered in the other channel, or finished: say so, then the question that waits now, if any.
  const ordinal = Number(input.parameters.ordinal);
  if (state.done || !state.open || state.open.ordinal !== ordinal || state.open.field !== input.parameters.field) {
    const last = state.answered.at(-1);
    const where = last ? ` ${VIA_WORDS[last.via]}` : "";
    if (state.done === "confirmed") return { text: `That one's already sorted${where} ✅ **${title}** is confirmed.`, clarify: null, outcome: "stale" };
    if (!state.open) return { text: `That one's already answered${where}. **${title}** is waiting for a look in HomeSend.`, clarify: null, outcome: "stale" };
    const question = checkQuestionText(kind, state.open, (item.extracted ?? null) as CompletenessReading);
    return { text: `That one's already answered${where} ✅ Next: ${question}`, clarify: clarifyFor(item, state, question, via), outcome: "stale" };
  }

  const open = state.open;
  // Text aimed at WonderHome is never acted on; the same question stays open (`injection.ts`).
  if (detectInstructionInjection(input.answer).flagged) {
    const question = checkQuestionText(kind, open, (item.extracted ?? null) as CompletenessReading);
    return { text: `I can only take the ${CHECK_LABELS[open.field]} from an answer here, so I've left it as it is. ${question}`, clarify: clarifyFor(item, state, question, via), outcome: "ignored" };
  }

  const split = splitCheckAnswer(open.mode, input.answer);
  let outcome: CheckOutcome;
  let lead: string;
  let extracted: Record<string, unknown> | undefined;

  if (split.kind === "yes") {
    outcome = "yes";
    lead = "Great, thanks!";
  } else if (split.kind === "skip") {
    outcome = "skipped";
    lead = "No problem.";
  } else if (split.kind === "no") {
    const next = askCorrection(state);
    if (!(await saveState(client, item, input.householdId, next))) return { text: "I couldn't save that just now. It's still Checking in HomeSend.", clarify: null };
    // "Looks right?" said no, with no detail to go through: one "please check".
    if (!next.open) return { text: `Thanks for checking. **${title}** stays Checking for now.\n💡 Have a look in HomeSend to fix it, or undo it.`, clarify: null, outcome: "skipped" };
    const question = checkQuestionText(kind, next.open, (item.extracted ?? null) as CompletenessReading);
    const lead = open.mode === "confirm_all" ? "No problem — let's fix it, one thing at a time." : "Thanks for checking.";
    return { text: `${lead} ${question}`, clarify: clarifyFor(item, next, question, via) };
  } else {
    const read = split.kind === "value" ? readDetailAnswer(kind, open.field, split.text, { timezone: input.timezone, now: input.now }) : null;
    if (read && read !== "skip") {
      const applied = await applyInPlace(client, { householdId: input.householdId, actorMemberId: input.actorMemberId, item, field: open.field, patch: read as Record<string, unknown>, timezone: input.timezone });
      extracted = { ...(item.extracted ?? {}), ...read };
      outcome = applied ? (open.mode === "fill" ? "filled" : "corrected") : "skipped";
      lead = applied ? "Got it — updated." : `Thanks — I've noted it, but I can't change the ${CHECK_LABELS[open.field]} here. You can fix it on its own screen.`;
    } else if (read === "skip") {
      outcome = "skipped";
      lead = "No problem.";
    } else if (!open.retried) {
      // One polite second ask, never the same words twice (design §5).
      const retried: CheckingState = { ...state, open: { ...open, retried: true } };
      const question = open.mode === "confirm" ? `Sorry, I couldn't tell. Is the ${CHECK_LABELS[open.field]} right? Say "yes", or tell me what it should be.` : secondAsk(open.field, []);
      if (!(await saveState(client, item, input.householdId, retried))) return { text: "I couldn't save that just now. It's still Checking in HomeSend.", clarify: null };
      return { text: question, clarify: clarifyFor(item, retried, question, via) };
    } else {
      outcome = "skipped";
      lead = "Sorry, I still couldn't make that out, so I've left it as it is.";
    }
  }

  const next = afterAnswer(state, outcome, via, input.now);
  if (!(await saveState(client, item, input.householdId, next, extracted))) return { text: "I couldn't save that just now. It's still Checking in HomeSend.", clarify: null };
  const shownTitle = typeof extracted?.title === "string" ? extracted.title : title;

  if (next.done === "confirmed") {
    const moved = await confirmHomeSendEntry(client, input.householdId, item.id, { memberId: input.actorMemberId, how: "answers", confidence: checkedScore(next) }).catch(() => 0);
    const said = moved > 0 ? `${lead} All checked ✅ **${shownTitle}** is confirmed, and its reminders are on.` : `${lead} **${shownTitle}** isn't Checking any more.`;
    return withNextWaiting(client, { householdId: input.householdId, memberId: input.actorMemberId, excludeItemId: item.id, via }, { text: said, clarify: null, outcome, ...(moved > 0 ? { confirmed: true as const } : {}) });
  }
  if (next.done === "please_check") {
    return withNextWaiting(client, { householdId: input.householdId, memberId: input.actorMemberId, excludeItemId: item.id, via }, { text: `${lead} **${shownTitle}** stays Checking for now.\n💡 Have a look in HomeSend and tap Looks right, or undo it.`, clarify: null, outcome });
  }
  const question = checkQuestionText(kind, next.open!, (extracted ?? item.extracted ?? null) as CompletenessReading);
  const asked = { ...item, extracted: extracted ?? item.extracted };
  return { text: `${lead} ${question}`, clarify: clarifyFor(asked, next, question, via), outcome };
}

// --- Batching: the next waiting question, and how many are left (14-066, part 3) -------------

type WaitingCheck = ItemRow & { created_at?: string };

/**
 * Entries still Checking whose open question is for this member, oldest
 * first, read in their household through the given client. Bounded: a person
 * is never shown more than a handful at once.
 */
export async function waitingChecks(client: SupabaseClient, input: { householdId: string; memberId: string; excludeItemId?: string }): Promise<WaitingCheck[]> {
  const { data, error } = await client
    .from("home_send_items")
    .select("id, status, classified_kind, extracted, understanding, routed_table, routed_id, created_by_member_id, created_at")
    .eq("household_id", input.householdId)
    .eq("status", "routed")
    .eq("understanding->checking->>recipientMemberId", input.memberId)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) return [];
  return ((data ?? []) as WaitingCheck[]).filter((row) => {
    if (row.id === input.excludeItemId || !row.classified_kind) return false;
    const state = readCheckingState(row.understanding?.checking);
    return Boolean(state?.open && !state.done);
  });
}

/** How many questions wait for this member across every entry still Checking (`questionsLeft` each). */
export function countWaiting(rows: readonly Pick<ItemRow, "understanding">[]): number {
  return rows.reduce((total, row) => total + questionsLeft(row.understanding?.checking), 0);
}

/**
 * Several questions waiting become one run (design principle 4): once an
 * entry is settled, the next entry's question follows in the same reply,
 * "Next, **Maths worksheet** (2 more after this): …". Never on another
 * member's entry; never more than the one next question.
 */
async function withNextWaiting(client: SupabaseClient, input: { householdId: string; memberId: string; excludeItemId: string; via: CheckChannel }, answer: CheckAnswer): Promise<CheckAnswer> {
  const rows = await waitingChecks(client, input).catch(() => []);
  const first = rows[0];
  const state = readCheckingState(first?.understanding?.checking);
  if (!first?.classified_kind || !state?.open) return answer;
  const question = checkQuestionText(first.classified_kind, state.open, (first.extracted ?? null) as CompletenessReading);
  const title = typeof first.extracted?.title === "string" ? first.extracted.title : null;
  const after = countWaiting(rows) - questionsLeft(first.understanding?.checking);
  const more = after > 0 ? ` (${after} more after this)` : "";
  return { ...answer, text: `${answer.text}\n📥 Next${title ? `, **${title}**` : ""}${more}: ${question}`, clarify: clarifyFor(first, state, question, input.via) };
}

/**
 * Puts an answer onto the one record this item added, through the domain's
 * own update, as the member. False when this kind of detail can't be changed
 * here (a receipt's lines, a grocery that was already tracked): it is then
 * noted on the item and left for its own screen.
 */
/** The same in-place write, for a plain correction of a recent entry (`entry-corrections.ts`). */
export async function applyHomeSendPatch(
  client: SupabaseClient,
  input: { householdId: string; actorMemberId: string; item: ItemRow; field: DetailField; patch: Record<string, unknown>; timezone: string },
): Promise<boolean> {
  return applyInPlace(client, input);
}

async function applyInPlace(
  client: SupabaseClient,
  input: { householdId: string; actorMemberId: string; item: ItemRow; field: DetailField; patch: Record<string, unknown>; timezone: string },
): Promise<boolean> {
  const { item, patch, householdId } = input;
  const id = item.routed_id;
  if (!id) return false;
  try {
    switch (item.routed_table) {
      case "obligations": {
        const amount = typeof patch.amount === "number" ? Math.round(patch.amount * 100) : undefined;
        await updateObligation(client, {
          id,
          householdId,
          ...(typeof patch.title === "string" ? { name: patch.title } : {}),
          ...(typeof patch.payee === "string" ? { payee: patch.payee } : {}),
          ...(amount !== undefined ? { amountMinor: amount } : {}),
          ...(typeof patch.dueDate === "string" ? { dueOn: patch.dueDate } : {}),
        });
        return true;
      }
      case "school_items": {
        const when = typeof patch.dueDate === "string" ? schoolWhen({ date: patch.dueDate, time: typeof patch.dueTime === "string" ? patch.dueTime : null, endTime: typeof patch.endTime === "string" ? patch.endTime : null, timezone: input.timezone }) : null;
        const title = typeof patch.title === "string" ? { title: patch.title } : {};
        // "That's for Kabir, not Meera" (a plain correction, 2026-11-14): the child it is filed under.
        const child = typeof patch.subjectMemberId === "string" ? { childMemberId: patch.subjectMemberId } : {};
        if (!when && !("title" in title) && !("childMemberId" in child)) return false;
        await updateSchoolItem(client, householdId, id, { ...title, ...child, ...(when ?? {}) });
        return true;
      }
      case "health_records": {
        const recordType = typeof patch.healthRecordType === "string" && (RECORD_TYPES as readonly string[]).includes(patch.healthRecordType) ? (patch.healthRecordType as RecordType) : undefined;
        const documentDate = typeof patch.documentDate === "string" ? patch.documentDate : undefined;
        const label = typeof patch.title === "string" ? patch.title : undefined;
        if (!recordType && !documentDate && !label) return false;
        await updateRecord(client, { householdId, memberId: input.actorMemberId }, id, { ...(recordType ? { recordType } : {}), ...(documentDate ? { documentDate } : {}), ...(label ? { label } : {}) });
        return true;
      }
      case "consumables": {
        // Only a grocery this item created is renamed; one already tracked is the household's own, never renamed by an answer.
        if (typeof patch.title !== "string") return false;
        const { data: change } = await client.from("homesend_changes").select("change_type").eq("household_id", householdId).eq("intake_id", item.id).eq("entity_id", id).is("undone_at", null).limit(1).maybeSingle();
        if ((change as { change_type?: string } | null)?.change_type !== "created") return false;
        const { data: row } = await client.from("consumables").select("category, unit, typical_quantity, days_per_unit").eq("household_id", householdId).eq("id", id).maybeSingle();
        const current = row as { category: string; unit: string; typical_quantity: number; days_per_unit: number | null } | null;
        if (!current) return false;
        await updateConsumable(client, { id, householdId, name: patch.title, category: current.category as never, unit: current.unit, typicalQuantity: Number(current.typical_quantity) || 1, daysPerUnit: current.days_per_unit });
        return true;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
