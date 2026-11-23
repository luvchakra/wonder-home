import { parseTimeOfDay } from "../conversation/reminder-time";
import { resolveTemporal } from "../conversation/temporal";
import { atLocal, localMoment, shiftDate } from "../notifications/timing";

/**
 * When a proposal stops mattering (owner, 2026-11-23: "this time has passed
 * already, so user can't possibly take any action. apply intelligence to
 * remove the entries").
 *
 * Live on 23 Nov, "Move morning walk to 5:20 am", asked at 23:29 the night
 * before, still sat on "Needs you" at 06:52 — after the walk it was about.
 * A proposal that changes one specific moment (moving one occurrence, a
 * one-off time, "tonight's dinner at 8") has a moment after which nobody can
 * act on it: the occurrence's start, or the new time if that is earlier, on
 * the household's clock. That is `payload.effective_until`.
 *
 * Understanding "which occurrence" is HomeBrain's, rules first:
 * - the words name the day ("tomorrow's walk", "Friday's class", "tonight");
 * - else the calendar's next occurrence of what is moved;
 * - else the next time the new clock time comes (ambiguous → the next one).
 * A recurring change ("every day", "from now on", the routine itself) has no
 * moment and waits for its answer or the 48-hour expiry. Only where the rules
 * cannot tell (a one-off with no day or time they can read) is a model asked
 * for the day, and its answer holds only once checked here against the
 * calendar (`checkModelDay`); the time itself is never the model's.
 *
 * Never for money, orders, or anything waiting on a grown-up: those keep their
 * own rules. Pure: nothing here reads, writes or calls a model.
 */

/** The actions whose proposal can be about one moment. Payments and orders never are. */
export const MOMENT_ACTIONS: ReadonlySet<string> = new Set(["adjust_schedule", "plan_event", "plan_meal"]);

/** The calendar's occurrence of what is moved, when grounding found one. */
export type MomentOccurrence = { start: Date };

export type MomentInput = {
  actionType: string;
  parameters: Record<string, unknown>;
  utterance?: string | null;
  /** When the proposal was made. */
  at: Date;
  timezone: string;
  /** Occurrences of the target on the calendar, if known. */
  occurrences?: readonly MomentOccurrence[];
  /** A proposal written before `effective_until` existed: with no day named, the time on the day after it was made. */
  legacy?: boolean;
  /** A child's request waiting on a grown-up. */
  referral?: boolean;
};

export type MomentReading =
  | { kind: "moment"; until: Date; day: string; basis: "new_time" | "occurrence" | "day_end" | "model" }
  | { kind: "recurring" }
  | { kind: "unclear" }
  | { kind: "none" };

const RECURRING = /\b(?:every|each|daily|weekly|weekdays|weekends|always|from now on|going forward|onwards|regularly|usual(?:ly)?|routine|permanently|for good)\b/i;
/** Words that mark one occurrence, not the routine. */
const ONE_OFF = /\b(?:today|tonight|tomorrow|this|next|on|the \d|\d{1,2}(?:st|nd|rd|th))\b|'s\b/i;
const DAY_WORDS =
  /\b(?:day after tomorrow|tomorrow(?: morning| afternoon| evening| night)?|today|tonight|this (?:morning|afternoon|evening)|(?:this |next |coming )?(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?)\b/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The words that say the new time, per action. */
function timeWords(input: MomentInput): string {
  const p = input.parameters;
  return input.actionType === "adjust_schedule" ? text(p.to) : text(p.time) || text(p.when) || text(p.window);
}

/** The minute of the day the new time names, or null when it names none ("Friday", "later"). */
export function clockMinute(words: string): number | null {
  if (!/\d|noon|midnight/i.test(words)) return null;
  const time = parseTimeOfDay(words.replace(DAY_WORDS, " ").trim() || words);
  return time ? time.hour * 60 + time.minute : null;
}

/** The local day the words name ("tomorrow's walk" → tomorrow), on the household's clock at `at`. */
export function dayNamed(words: string, at: Date, timezone: string): string | null {
  const found = DAY_WORDS.exec(words.replace(/['’]s\b/g, ""));
  if (!found) return null;
  const resolved = resolveTemporal(found[0].toLowerCase(), { timezone, now: at });
  return resolved && resolved.precision !== "range" ? resolved.date : null;
}

function earliest(...dates: (Date | null)[]): Date | null {
  const real = dates.filter((date): date is Date => date !== null && Number.isFinite(date.getTime()));
  return real.length === 0 ? null : new Date(Math.min(...real.map((date) => date.getTime())));
}

/** When the moment is, from the rules. */
export function readProposalMoment(input: MomentInput): MomentReading {
  if (!MOMENT_ACTIONS.has(input.actionType) || input.referral) return { kind: "none" };
  const what = text(input.parameters.what) || text(input.parameters.title);
  const newWords = timeWords(input);
  const said = [what, newWords, text(input.utterance)].join(" ");
  if (RECURRING.test(said)) return { kind: "recurring" };

  const zone = input.timezone;
  const today = localMoment(input.at, zone).dateKey;
  const minute = clockMinute(newWords);
  // The occurrence's day: what is moved names it first ("tomorrow's walk"), then the whole sentence.
  const resolvedTo = input.parameters.toResolved as { date?: unknown; precision?: unknown } | undefined;
  const namedDay = dayNamed(what, input.at, zone) ?? dayNamed(text(input.utterance).split(/\bto\b/i)[0] ?? "", input.at, zone);
  const newDay = dayNamed(newWords, input.at, zone) ?? (typeof resolvedTo?.date === "string" && resolvedTo.precision !== "range" ? resolvedTo.date : null);

  const upcoming = [...(input.occurrences ?? [])].filter((o) => Number.isFinite(o.start.getTime())).sort((a, b) => a.start.getTime() - b.start.getTime());
  const occurrence = namedDay
    ? upcoming.find((o) => localMoment(o.start, zone).dateKey === namedDay)
    : upcoming.find((o) => o.start.getTime() > input.at.getTime());

  const day = namedDay ?? (occurrence ? localMoment(occurrence.start, zone).dateKey : null) ?? newDay;
  let newAt: Date | null = null;
  if (minute !== null) {
    if (day) newAt = atLocal(day, minute, zone);
    else if (input.legacy) newAt = atLocal(shiftDate(today, 1), minute, zone);
    else {
      // Ambiguous: the next time that clock time comes.
      const todayAt = atLocal(today, minute, zone);
      newAt = todayAt.getTime() > input.at.getTime() ? todayAt : atLocal(shiftDate(today, 1), minute, zone);
    }
  }
  const until = earliest(occurrence?.start ?? null, newAt);
  if (until) return { kind: "moment", until, day: localMoment(until, zone).dateKey, basis: newAt && until.getTime() === newAt.getTime() ? "new_time" : "occurrence" };
  // A day and no time: once that day is over, there is nothing left to move.
  const dayOnly = namedDay ?? (occurrence ? localMoment(occurrence.start, zone).dateKey : null);
  if (dayOnly) return { kind: "moment", until: atLocal(shiftDate(dayOnly, 1), 0, zone), day: dayOnly, basis: "day_end" };
  return ONE_OFF.test(what) ? { kind: "unclear" } : { kind: "none" };
}

/**
 * A model's answer for an unclear one-off — the local day the occurrence is
 * on — checked before it counts: a real date, not before the proposal, within
 * two weeks of it, and, when the calendar has occurrences, one of their days.
 * The moment is then worked out here, never taken from the model.
 */
export function checkModelDay(answer: string | null | undefined, input: MomentInput): MomentReading {
  if (!answer || !/^\d{4}-\d{2}-\d{2}$/.test(answer) || Number.isNaN(Date.parse(`${answer}T00:00:00Z`))) return { kind: "none" };
  const zone = input.timezone;
  const made = localMoment(input.at, zone).dateKey;
  if (answer < made || answer > shiftDate(made, 14)) return { kind: "none" };
  const onDay = (input.occurrences ?? []).filter((o) => localMoment(o.start, zone).dateKey === answer);
  if ((input.occurrences ?? []).length > 0 && onDay.length === 0) return { kind: "none" };
  const minute = clockMinute(timeWords(input));
  const until = earliest(onDay[0]?.start ?? null, minute !== null ? atLocal(answer, minute, zone) : null) ?? atLocal(shiftDate(answer, 1), 0, zone);
  return { kind: "moment", until, day: answer, basis: "model" };
}

/** What the proposal's payload says about its moment, for writing down. */
export function momentPayload(reading: MomentReading): Record<string, unknown> {
  switch (reading.kind) {
    case "moment":
      return { effective_until: reading.until.toISOString(), moment: { basis: reading.basis, day: reading.day } };
    case "recurring":
      return { moment: { recurring: true } };
    case "unclear":
      return { moment: { unclear: true } };
    default:
      return {};
  }
}

export type WaitingProposal = {
  action_type: string;
  created_at: string;
  payload: Record<string, unknown> | null;
};

/**
 * When a waiting proposal stops mattering, or null when it waits for its
 * answer or the 48-hour expiry. Its own `effective_until` first; one written
 * before that existed is read again from its words (legacy), with the
 * calendar's occurrences when the caller has them.
 */
export function momentOf(row: WaitingProposal, timezone: string, occurrences?: readonly MomentOccurrence[]): Date | null {
  const payload = row.payload ?? {};
  if (!MOMENT_ACTIONS.has(row.action_type) || (payload.referral && typeof payload.referral === "object")) return null;
  const stored = payload.effective_until;
  if (typeof stored === "string" && Number.isFinite(Date.parse(stored))) return new Date(stored);
  const moment = payload.moment as { recurring?: unknown; unclear?: unknown; checked?: unknown } | undefined;
  if (moment?.recurring || moment?.checked) return null;
  const parameters = (payload.parameters as Record<string, unknown> | undefined) ?? {};
  const reading = readProposalMoment({ actionType: row.action_type, parameters, at: new Date(row.created_at), timezone, occurrences, legacy: true });
  return reading.kind === "moment" ? reading.until : null;
}

/** Whether a waiting proposal's moment has passed. */
export function momentPassed(row: WaitingProposal, timezone: string, now: Date, occurrences?: readonly MomentOccurrence[]): boolean {
  const until = momentOf(row, timezone, occurrences);
  return until !== null && until.getTime() <= now.getTime();
}

/** The one plain line HomeTalk adds when a proposal's moment passed. No emoji: a thing not done stays plain. */
export function momentPassedLine(row: WaitingProposal): string {
  const payload = row.payload ?? {};
  const parameters = (payload.parameters as Record<string, unknown> | undefined) ?? {};
  const what = text(parameters.what) || text(parameters.title);
  const to = timeWords({ actionType: row.action_type, parameters, at: new Date(row.created_at), timezone: "UTC" });
  if (row.action_type === "adjust_schedule" && what && to) return `Didn't move the ${what.replace(/^(?:the|my|our)\s+/i, "")}: ${to} has passed.`;
  const summary = text((payload.preview as { summary?: unknown } | undefined)?.summary);
  return summary ? `Didn't do "${summary}": its time has passed.` : "Didn't do it: its time has passed.";
}
