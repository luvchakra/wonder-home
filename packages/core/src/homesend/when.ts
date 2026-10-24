import { dayFromDateText, findDatePhrase, timeFromDateText } from "../ai/classify-intake";
import type { HomeSendExtraction } from "./items";

/**
 * The day and time a stored reading names, filled in wherever its own words
 * give them (the owner, 2026-10-25: "the date and time is already there,
 * still app can't identify"). A reading filed under a kind with no date — a
 * camp flyer read as a grocery, or one WonderHome could not place — keeps
 * its date words, so moving it to an event at review opens with its day and
 * time already set. Read from `dateText` first, then the title, notes and
 * summary; decided by the same rules as a fresh reading (`dayFromDateText`,
 * `timeFromDateText`), on the household's clock, relative to when it was
 * sent. A day it cannot be sure of stays empty for the person to fill in.
 *
 * Never overrides a day already there: what the model grounded, or the
 * person typed, wins.
 */
export function recoverWhen<T extends Pick<HomeSendExtraction, "title" | "notes" | "dueDate"> & Partial<Pick<HomeSendExtraction, "summary" | "dueTime" | "endTime" | "dateText">>>(
  reading: T,
  context: { timezone: string | null; now: Date },
): T {
  if (reading.dueDate || !context.timezone) return reading;
  const phrase = reading.dateText || findDatePhrase(reading.title) || findDatePhrase(reading.notes) || findDatePhrase(reading.summary);
  if (!phrase) return reading;
  const day = dayFromDateText(phrase, { timezone: context.timezone, now: context.now });
  if (!day) return reading;
  const time = timeFromDateText(phrase);
  return { ...reading, dateText: reading.dateText || phrase, dueDate: day, dueTime: reading.dueTime || time?.start || null, endTime: reading.endTime || time?.end || null };
}
