import { atLocal } from "../notifications/timing";
import { dayLabel, laterToday, localClock, resolveTemporal, roundUpToQuarter } from "./temporal";

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
  | { ok: true; at: Date; /** Its local day, YYYY-MM-DD. */ date: string; /** "today (Thu 24 Sep)" */ day: string; /** "9:35pm" */ time: string }
  | { ok: false; question: string };

const ASK_WHEN = 'When should I remind you — "later today", "tomorrow", or a date like "2 Oct"?';

export function reminderMoment(when: string, timeText: string | null, options: { timezone: string; now: Date }): ReminderMoment {
  const { timezone, now } = options;
  const resolved = resolveTemporal(when, options);
  if (!resolved || resolved.precision === "range") return { ok: false, question: ASK_WHEN };
  const clock = localClock(now, timezone);
  if (resolved.date < clock.date) return { ok: false, question: `That day has already passed. ${ASK_WHEN}` };

  // A moment from now already carries its time; any time said earlier yields to it.
  const exact = resolved.window !== null && resolved.window.from === resolved.window.to;
  const said = !exact && timeText ? timeText.trim().toLowerCase() : null;
  const time = said === "noon" || said === "midday" ? { hour: 12, minute: 0 } : said ? parseTimeOfDay(said) : null;
  if (said && !time) return { ok: false, question: 'What time should I remind you — for example "9am" or "6:30pm"?' };

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
      return { ok: false, question: `${words} today has already passed. Should I remind you later today, or tomorrow at ${words}?` };
    } else {
      const named = resolved.label.replace(/\s*\(.*\)$/, "");
      return { ok: false, question: `${named.charAt(0).toUpperCase()}${named.slice(1)} has already passed. ${ASK_WHEN}` };
    }
  }

  const local = localClock(at, timezone);
  return { ok: true, at, date: local.date, day: dayLabel(local.date, clock.date), time: formatHourMinute(Math.floor(local.minute / 60), local.minute % 60) };
}

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** "4", "4pm", "16:30" → hour/minute. A bare hour 1-11 with no am/pm reads as afternoon/evening — the same household convention `rules.ts`'s meal-time parsing already uses. */
export function parseTimeOfDay(raw: string): { hour: number; minute: number } | null {
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

export function formatHourMinute(hour: number, minute: number): string {
  const period = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${twelve}${period}` : `${twelve}:${String(minute).padStart(2, "0")}${period}`;
}
