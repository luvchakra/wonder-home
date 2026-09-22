import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { runHouseholdAgents, type RunActor } from "../ai/run";
import { createConsumable } from "../commerce/repository";
import { createAppointment, type AppointmentType } from "../health/appointments";
import { createIssue, listIssues, setIssueStatus } from "../health/issues";
import { createVital, type VitalType } from "../health/vitals";
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
  /** Only `check_agents` needs these — who is asking, for the tool gate a run checks per step. */
  actor?: RunActor;
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
    case "set_fitness_goal":
      return `Noted, though fitness goals aren't tracked yet — I have not set anything up on my own.`;
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

async function runAgentCheck(context: ExecutionContext): Promise<ExecutionResult> {
  if (!context.actor) return { ok: false, reason: "I could not tell who was asking, so I did not run a check." };

  const summary = await runHouseholdAgents(context.supabase, context.householdId, context.actor);
  return { ok: true, text: summary.headline, result: { runId: summary.runId, executed: summary.executed, awaitingApproval: summary.awaitingApproval, refused: summary.refused } };
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
  const match = open.find((issue) => issue.label.toLowerCase().includes(label) || label.includes(issue.label.toLowerCase()));
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

function parseVitalReading(vitalWord: string, reading: string): ParsedVital | null {
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

/** "4", "4pm", "16:30" → hour/minute. A bare hour 1-11 with no am/pm reads as afternoon/evening — the same household convention `rules.ts`'s meal-time parsing already uses. */
function parseTimeOfDay(raw: string): { hour: number; minute: number } | null {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3];
  if (hour > 23 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 11) hour += 12;
  return { hour, minute };
}

function formatHourMinute(hour: number, minute: number): string {
  const period = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${twelve}${period}` : `${twelve}:${String(minute).padStart(2, "0")}${period}`;
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
