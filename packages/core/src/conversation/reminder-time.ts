import { atLocal } from "../notifications/timing";
import { dayLabel, laterToday, localClock, resolveTemporal, roundUpToQuarter } from "./temporal";
import { dayHalfOf, otherHalf, readTimeOfDay, type DayHalfHint } from "./time-of-day";

/**
 * When a HomeTalk reminder actually goes off (Wave 4 §10), decided once and
 * used both to ask and to write, so the reply can never name a time the
 * reminder does not keep.
 *
 * - "later today", "in 2 hours", "on the way home" are moments from now.
 * - A day alone means 9am — except today, where 9am may have gone: then it
 *   is "later today".
 * - A part of today already under way ("this evening" at 8:30 pm) comes
 *   shortly, while it is still that part of the day.
 * - Anything wholly in the past is never written "for now" and described
 *   as something else: it becomes one question.
 */

export type ReminderMoment =
  | {
      ok: true;
      at: Date;
      /** Its local day, YYYY-MM-DD. */ date: string;
      /** "today (Thu 24 Sep)" */ day: string;
      /** "9:35pm" */ time: string;
      /** "1 o'clock" when its am/pm was chosen rather than said, so the reply can say "I took 1 o'clock as 1pm". */
      assumedFrom?: string;
      /** The other half of the day for that time ("1am"), for "say 1am if not". */
      otherTime?: string;
    }
  | { ok: false; question: string; /** What the question asks for, so its tap answers are about the same thing. */ slot: "day" | "time" };

const ASK_WHEN = 'When should I remind you — "later today", "tomorrow", or a date like "2 Oct"?';

export function reminderMoment(when: string, timeText: string | null, options: { timezone: string; now: Date; /** Words around the time ("for dinner"), for its am/pm. */ context?: string }): ReminderMoment {
  const { timezone, now } = options;
  const resolved = resolveTemporal(when, options);
  if (!resolved || resolved.precision === "range") return { ok: false, question: ASK_WHEN, slot: "day" };
  const clock = localClock(now, timezone);
  if (resolved.date < clock.date) return { ok: false, question: `That day has already passed. ${ASK_WHEN}`, slot: "day" };

  // A moment from now already carries its time; any time said earlier yields to it.
  const exact = resolved.window !== null && resolved.window.from === resolved.window.to;
  const said = !exact && timeText ? timeText.trim().toLowerCase() : null;
  const hint: DayHalfHint = dayHalfOf(when) ?? dayHalfOf(options.context);
  let time = said ? readTimeOfDay(said, { hint }) : null;
  if (said && !time) return { ok: false, question: ASK_TIME, slot: "time" };
  // A time whose half of the day was chosen and has gone today is the other half, still ahead ("at 9" said at 10 am is 9pm).
  if (time?.assumed && resolved.date === clock.date && time.hour * 60 + time.minute <= clock.minute) {
    const other = otherHalf(time);
    if (other.hour * 60 + other.minute > clock.minute) time = other;
  }

  let at: Date;
  if (resolved.window) at = atLocal(resolved.date, minutesOf(resolved.window.from), timezone);
  else if (time) at = atLocal(resolved.date, time.hour * 60 + time.minute, timezone);
  else if (resolved.date === clock.date) at = laterToday(now);
  else at = atLocal(resolved.date, 9 * 60, timezone);
  if (time && resolved.window && !exact) at = atLocal(resolved.date, time.hour * 60 + time.minute, timezone);

  if (at.getTime() <= now.getTime() + 60_000) {
    const underWay = !time && resolved.window !== null && !exact && resolved.date === clock.date && minutesOf(resolved.window.to) - clock.minute >= 20;
    if (underWay) {
      at = roundUpToQuarter(new Date(now.getTime() + 15 * 60_000));
    } else if (time) {
      const words = formatHourMinute(time.hour, time.minute);
      return { ok: false, question: `${words} today has already passed. Should I remind you later today, or tomorrow at ${words}?`, slot: "day" };
    } else {
      const named = resolved.label.replace(/\s*\(.*\)$/, "");
      return { ok: false, question: `${named.charAt(0).toUpperCase()}${named.slice(1)} has already passed. ${ASK_WHEN}`, slot: "day" };
    }
  }

  const local = localClock(at, timezone);
  return {
    ok: true,
    at,
    date: local.date,
    day: dayLabel(local.date, clock.date),
    time: formatHourMinute(Math.floor(local.minute / 60), local.minute % 60),
    ...(time?.assumed && said ? { assumedFrom: said, otherTime: formatHourMinute((time.hour + 12) % 24, time.minute) } : {}),
  };
}

const ASK_TIME = 'What time should I remind you — for example "9am" or "6:30pm"?';

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** "4", "4pm", "16:30", "1 o'clock", "half past 6" → hour/minute (`time-of-day.ts`); with no am/pm, the plausible half of the day. */
export function parseTimeOfDay(raw: string, hint: DayHalfHint = null): { hour: number; minute: number; assumed: boolean } | null {
  return readTimeOfDay(raw, { hint });
}

export function formatHourMinute(hour: number, minute: number): string {
  const period = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${twelve}${period}` : `${twelve}:${String(minute).padStart(2, "0")}${period}`;
}
