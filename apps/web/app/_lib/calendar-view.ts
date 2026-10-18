import { localMoment, partsOf, shiftDate, type CalendarView } from "@wonderhome/core/calendar/dates";
import type { CalendarEntry } from "@wonderhome/core/calendar/projection";
import type { Translate } from "@wonderhome/core/i18n/translate";
import type { CalendarEntryRowProps } from "@wonderhome/core/ui/calendar-entry";

/**
 * Turning calendar entries into the words a screen shows (story 12-009), in
 * the person's language and on the household's clock. Dates are made from a
 * `YYYY-MM-DD` key at noon UTC and formatted in UTC, so a calendar day is
 * never moved by a time zone.
 */

/** Regions whose week starts on Sunday; everywhere else starts on Monday (ISO). */
const SUNDAY_FIRST = new Set(["US", "CA", "MX", "BR", "JP", "KR", "TW", "HK", "IL", "PH", "ZA", "SA", "AE"]);

export function weekStartFor(region: string | null | undefined): 0 | 1 {
  return region && SUNDAY_FIRST.has(region) ? 0 : 1;
}

export function calendarHref(view: CalendarView, date: string): string {
  return `/calendar?view=${view}&date=${date}`;
}

export type DateWords = {
  monthTitle: (year: number, month: number) => string;
  monthName: (year: number, month: number) => string;
  dayTitle: (dateKey: string) => string;
  shortDate: (dateKey: string) => string;
  dayNumber: (dateKey: string) => string;
  weekdays: (weekStartsOn: number, style: "short" | "narrow") => string[];
  weekdayOf: (dateKey: string) => string;
};

export function dateWords(locale: string): DateWords {
  const at = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);
  const fmt = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    } catch {
      return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" });
    }
  };
  const monthYear = fmt({ month: "long", year: "numeric" });
  const month = fmt({ month: "long" });
  const longDay = fmt({ weekday: "long", day: "numeric", month: "long" });
  const short = fmt({ day: "numeric", month: "short" });
  const day = fmt({ day: "numeric" });
  const shortWeekday = fmt({ weekday: "short" });
  const narrowWeekday = fmt({ weekday: "narrow" });
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    monthTitle: (y, m) => monthYear.format(at(`${y}-${pad(m)}-15`)),
    monthName: (y, m) => month.format(at(`${y}-${pad(m)}-15`)),
    dayTitle: (key) => longDay.format(at(key)),
    shortDate: (key) => short.format(at(key)),
    dayNumber: (key) => day.format(at(key)),
    // 4 Jan 2026 was a Sunday.
    weekdays: (weekStartsOn, style) =>
      Array.from({ length: 7 }, (_, index) => (style === "short" ? shortWeekday : narrowWeekday).format(at(shiftDate("2026-01-04", (weekStartsOn + index) % 7)))),
    weekdayOf: (key) => shortWeekday.format(at(key)),
  };
}

export type EntryWords = {
  t: Translate;
  time: (at: Date) => string;
  shortDate: (dateKey: string) => string;
  nameOf: (memberId: string) => string | null;
  timeZone: string;
};

/** "9:00 – 10:30", "All day", "until 8:00", seen from one day. */
export function whenOn(entry: CalendarEntry, day: string, words: EntryWords): string {
  const { t, time, timeZone } = words;
  if (entry.allDay) return t("calendar.entry.allDay");
  if (!entry.end) return time(entry.start);
  const startDay = localMoment(entry.start, timeZone).dateKey;
  const endDay = localMoment(new Date(entry.end.getTime() - 1), timeZone).dateKey;
  if (startDay === day && endDay === day) return `${time(entry.start)} – ${time(entry.end)}`;
  if (startDay === day) return `${time(entry.start)} – ${words.shortDate(endDay)} ${time(entry.end)}`;
  if (endDay === day) return t("calendar.entry.until", { time: time(entry.end) });
  return t("calendar.entry.allDay");
}

export function whoOf(entry: CalendarEntry, words: EntryWords): string | null {
  if (entry.source === "holiday" || entry.memberIds.length === 0) return null;
  const names = entry.memberIds.map(words.nameOf).filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : null;
}

export function badgesOf(entry: CalendarEntry, t: Translate): string[] {
  const badges: string[] = [];
  if (entry.status === "proposed") badges.push(t("calendar.entry.proposed"));
  if (entry.repeats && entry.source === "event") badges.push(t("calendar.entry.repeats"));
  if (entry.visibility === "private") badges.push(t("calendar.entry.private"));
  if (entry.visibility === "participants") badges.push(t("calendar.entry.participants"));
  if (entry.protected) badges.push(t("calendar.entry.protected"));
  return badges;
}

/** An event opens on the day it was tapped on: its occurrence for a repeating one, and the calendar day to go back to. */
export function hrefOf(entry: CalendarEntry, day: string): string | null {
  if (!entry.href) return null;
  return entry.source === "event" ? `${entry.href}?on=${entry.occurrenceDate ?? day}` : entry.href;
}

export function entryRow(entry: CalendarEntry, day: string, words: EntryWords): CalendarEntryRowProps & { key: string } {
  return {
    key: entry.id,
    title: entry.title,
    category: entry.category,
    when: whenOn(entry, day, words),
    who: whoOf(entry, words),
    detail: entry.source === "holiday" && entry.detail ? words.t("calendar.entry.holiday", { source: entry.detail }) : entry.detail,
    badges: badgesOf(entry, words.t),
    proposed: entry.status === "proposed",
    href: hrefOf(entry, day),
  };
}

/** The year and month a view's title names. */
export function monthOf(dateKey: string): { year: number; month: number } {
  const { year, month } = partsOf(dateKey);
  return { year, month };
}
