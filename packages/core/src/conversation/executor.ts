import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { createConsumable } from "../commerce/repository";
import { recordAvailabilityException } from "../household/helpers-repository";
import type { HouseholdIntent } from "./intent";
import { linkTo } from "./reply-format";

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
  members: readonly { id: string; displayName: string }[];
  timezone: string;
  now?: Date;
};

export type ExecutionResult =
  | { ok: true; text: string; result: Record<string, unknown> }
  | { ok: false; reason: string };

/** Whether a governed write exists for this intent right now. */
export function canExecute(intent: HouseholdIntent): boolean {
  switch (intent.action) {
    case "add_to_list":
      return typeof intent.parameters.item === "string" && intent.parameters.item.trim().length > 0;
    case "record_absence":
      return intent.target.kind === "member" && Boolean(intent.target.reference);
    case "set_preference":
      return Boolean(intent.target.reference);
    default:
      return false;
  }
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
  try {
    switch (intent.action) {
      case "add_to_list":
        return await addToGroceries(intent, context);
      case "record_absence":
        return await recordAbsence(intent, context);
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
    if (thrown instanceof ApiError) return { ok: false, reason: thrown.message };
    console.error("[conversation] execution failed", { action: intent.action, error: thrown instanceof Error ? thrown.name : "unknown" });
    return { ok: false, reason: "Something went wrong on my side, and nothing was changed." };
  }
}

async function addToGroceries(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const raw = String(intent.parameters.item ?? "").trim();
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (!name) return { ok: false, reason: "What should I add?" };

  try {
    const { id } = await createConsumable(context.supabase, {
      householdId: context.householdId,
      name,
      category: "grocery",
      unit: "item",
      typicalQuantity: 1,
    });
    return {
      ok: true,
      text: `Added **${name}** to the ${linkTo("/groceries", "groceries")}. Once I see it bought a few times I will work out how often you need it.`,
      result: { consumableId: id, name },
    };
  } catch (thrown) {
    if (thrown instanceof ApiError && thrown.code === "conflict") {
      return { ok: true, text: `**${name}** is already on the ${linkTo("/groceries", "groceries")}, so there was nothing to add.`, result: { name, alreadyTracked: true } };
    }
    throw thrown;
  }
}

async function recordAbsence(intent: HouseholdIntent, context: ExecutionContext): Promise<ExecutionResult> {
  const reference = intent.target.reference ?? "";
  const memberId = typeof intent.parameters.memberId === "string" ? intent.parameters.memberId : null;
  const member =
    context.members.find((entry) => entry.id === memberId) ??
    context.members.find((entry) => firstName(entry.displayName) === reference.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!member) {
    return { ok: false, reason: `I do not know anyone called “${reference}” in this household. Who did you mean?` };
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
    result: { memberId: member.id, onDate },
  };
}

function firstName(displayName: string): string {
  return (displayName.split(/\s+/)[0] ?? displayName).toLowerCase().replace(/[^a-z0-9]/g, "");
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * "today", "tomorrow", "day after tomorrow", a weekday → an ISO date in the
 * household's own timezone. Pure, so the arithmetic is testable without a
 * clock. Anything it cannot pin to one day returns null, and the caller asks.
 */
export function resolveWhen(when: string, now: Date, timezone: string): string | null {
  const word = when.trim().toLowerCase().replace(/^(?:on|this|next)\s+/, "");
  const today = isoDateIn(now, timezone);

  if (word === "today" || word === "tonight" || word === "") return today;
  if (word === "tomorrow") return addDays(today, 1);
  if (word === "day after tomorrow" || word === "day after") return addDays(today, 2);

  const weekday = WEEKDAYS.findIndex((name) => name === word || name.slice(0, 3) === word.slice(0, 3));
  if (weekday >= 0) {
    const current = new Date(`${today}T12:00:00Z`).getUTCDay();
    const ahead = (weekday - current + 7) % 7;
    return addDays(today, ahead);
  }

  return null;
}

function isoDateIn(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function describeDate(isoDate: string, when: string, timezone: string): string {
  const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${isoDate}T12:00:00Z`));
  const word = when.trim().toLowerCase();
  void timezone;
  return word === "today" || word === "tomorrow" ? `${word} (${label})` : `on ${label}`;
}
