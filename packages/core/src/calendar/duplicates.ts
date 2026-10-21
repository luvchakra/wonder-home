import { sameOccasionName } from "../context/matching";
import { similarity } from "../context/normalize";
import { localMoment } from "./dates";
import type { CalendarEntry } from "./projection";

/**
 * Is this already on the calendar? (the owner, 2026-10-21: "why there are 2
 * entries for the same event, there should be duplication check before any
 * event is created").
 *
 * Asked before any event is added — the calendar's add sheet, Kids & School's
 * add form, HomeTalk — over what the calendar shows that day, whichever module
 * it came from: a family event and a school notice for the same trip are one
 * trip. The same name, nearly the same name, or the same occasion once its
 * kind words are set aside ("Field trip to Bounce", "Bounce School Trip"),
 * on the same local day. Nothing is refused: the person is told and decides.
 */

/** Sources that hold things a person adds; holidays, birthdays and the like are never a copy of a new event. */
const ADDABLE = new Set(["event", "school", "health", "activity"]);

export type DuplicateCandidate = {
  title: string;
  /** The local day ("2026-10-22") the new entry is on. */
  date: string;
  timeZone: string;
  /** An entry being changed is never its own duplicate. */
  ignoreSourceId?: string;
};

export function sameEntryOnDay(entries: readonly CalendarEntry[], candidate: DuplicateCandidate): CalendarEntry | null {
  return sameTitledOnDay(entries.filter((entry) => ADDABLE.has(entry.source)), candidate);
}

/**
 * The same test over any dated records — family events and school items read
 * straight from their tables, where no calendar projection is at hand
 * (HomeTalk). An all-day record carries its own local day.
 */
export function sameTitledOnDay<T extends { sourceId: string; title: string; start: Date; day?: string | null }>(records: readonly T[], candidate: DuplicateCandidate): T | null {
  const title = candidate.title.trim();
  if (!title) return null;
  let best: { record: T; score: number } | null = null;
  for (const record of records) {
    if (candidate.ignoreSourceId && record.sourceId === candidate.ignoreSourceId) continue;
    if ((record.day ?? localMoment(record.start, candidate.timeZone).dateKey) !== candidate.date) continue;
    const score = similarity(title, record.title);
    const same = score >= 0.8 || sameOccasionName(title, record.title);
    if (same && (!best || score > best.score)) best = { record, score };
  }
  return best?.record ?? null;
}
