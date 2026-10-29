/**
 * Story 26-022 — turning parsed ICS events into rows WonderHome can import.
 *
 * All feed text is untrusted: titles, places and notes are stripped of control
 * characters and capped to the column's length, so nothing can be injected into
 * the UI (which escapes anyway) or carried further. Events are clipped to a
 * sync window and the whole import is capped. A recurring event is expanded
 * (bounded) into one row per occurrence; a RECURRENCE-ID override replaces the
 * occurrence it names.
 */

import type { ParsedIcs, IcsRawEvent } from "./ics";
import { parseIcsDateTime, dateKeyInZone } from "./time";
import { parseRrule, expandRecurrence } from "./recurrence";

/** The most events imported from one feed, after recurrence expansion. */
export const MAX_IMPORT_EVENTS = 1000;
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 365;
const DEFAULT_TIMED_MS = 60 * 60_000;
const ONE_DAY_MS = 86_400_000;
const MAX_EXTERNAL_ID = 200;

export type ImportableEvent = {
  /** Stable per (feed, event/occurrence); the UID, or UID@occurrenceDate for an expanded series. */
  externalId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timeZone: string | null;
  location: string | null;
  notes: string | null;
};

export type ImportStats = { imported: number; skipped: number; truncated: boolean };
export type ImportResult = { events: ImportableEvent[]; stats: ImportStats };

/** A small deterministic hash, for synthesising or shortening an id. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** A single line of feed text: no control characters, whitespace collapsed, capped. */
function cleanLine(raw: string | null | undefined, max: number): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** A block of feed text: newlines kept, other control characters dropped, capped. */
function cleanBlock(raw: string | null | undefined, max: number): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** Parses an ISO 8601 duration (e.g. PT1H30M, P2D, P1W) to milliseconds, else null. */
function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const week = /^([+-]?)P(\d+)W$/.exec(raw.trim());
  if (week) return (week[1] === "-" ? -1 : 1) * Number(week[2]) * 7 * ONE_DAY_MS;
  const m = /^([+-]?)P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(raw.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const days = Number(m[2] ?? 0);
  const hours = Number(m[3] ?? 0);
  const minutes = Number(m[4] ?? 0);
  const seconds = Number(m[5] ?? 0);
  const ms = ((days * 24 + hours) * 60 + minutes) * 60_000 + seconds * 1000;
  return ms > 0 ? sign * ms : null;
}

function uidOf(event: IcsRawEvent): string {
  if (event.uid) return event.uid;
  // A feed without UIDs still needs a stable key: derive one from what it has.
  return `noid-${hash(`${event.summary ?? ""}|${event.dtstart?.value ?? ""}`)}`;
}

function externalIdFor(uid: string, occurrenceKey: string | null): string {
  const full = occurrenceKey ? `${uid}@${occurrenceKey}` : uid;
  if (full.length <= MAX_EXTERNAL_ID) return full;
  return occurrenceKey ? `h${hash(uid)}@${occurrenceKey}` : `h${hash(uid)}`;
}

/** The start/end/duration of one event, honouring DTEND, DURATION and all-day exclusivity. */
function timesOf(event: IcsRawEvent, householdTimeZone: string): { start: Date; end: Date; allDay: boolean; timeZone: string } | null {
  if (!event.dtstart) return null;
  const start = parseIcsDateTime(event.dtstart, householdTimeZone);
  if (!start) return null;

  let end: Date;
  if (event.dtend) {
    const parsedEnd = parseIcsDateTime(event.dtend, householdTimeZone);
    end = parsedEnd ? parsedEnd.start : new Date(start.start.getTime() + (start.allDay ? ONE_DAY_MS : DEFAULT_TIMED_MS));
  } else {
    const duration = parseDuration(event.duration);
    end = new Date(start.start.getTime() + (duration ?? (start.allDay ? ONE_DAY_MS : DEFAULT_TIMED_MS)));
  }
  // family_events requires starts_at < ends_at.
  if (end.getTime() <= start.start.getTime()) {
    end = new Date(start.start.getTime() + (start.allDay ? ONE_DAY_MS : DEFAULT_TIMED_MS));
  }
  return { start: start.start, end, allDay: start.allDay, timeZone: start.timeZone };
}

/**
 * Maps a parsed feed to importable events within the window [now − 30d, now +
 * 365d], expanding recurrence and applying overrides, sanitising all text, and
 * capping the total.
 */
export function mapFeedToEvents(parsed: ParsedIcs, opts: { householdTimeZone: string; now?: Date; maxEvents?: number }): ImportResult {
  const now = opts.now ?? new Date();
  const householdTimeZone = opts.householdTimeZone;
  const maxEvents = Math.min(Math.max(1, opts.maxEvents ?? MAX_IMPORT_EVENTS), MAX_IMPORT_EVENTS);
  const window = { start: new Date(now.getTime() - WINDOW_PAST_DAYS * ONE_DAY_MS), end: new Date(now.getTime() + WINDOW_FUTURE_DAYS * ONE_DAY_MS) };

  const byId = new Map<string, ImportableEvent>();
  let skipped = 0;
  let truncated = parsed.truncated;

  // Non-override events first, then overrides, so a RECURRENCE-ID replaces the
  // occurrence a master produced regardless of feed order.
  const ordered = [...parsed.events.filter((e) => !e.recurrenceId), ...parsed.events.filter((e) => e.recurrenceId)];

  for (const event of ordered) {
    if (byId.size >= maxEvents) {
      truncated = true;
      break;
    }
    if (event.status === "CANCELLED") {
      skipped += 1;
      continue;
    }
    const times = timesOf(event, householdTimeZone);
    if (!times) {
      skipped += 1;
      continue;
    }
    const uid = uidOf(event);
    const title = cleanLine(event.summary, 200) ?? "(Untitled event)";
    const location = cleanLine(event.location, 200);
    const notes = cleanBlock(event.description, 1000);
    const base = { title, location, notes, allDay: times.allDay, timeZone: times.timeZone };
    const duration = times.end.getTime() - times.start.getTime();

    const put = (externalId: string, start: Date) => {
      if (byId.size >= maxEvents && !byId.has(externalId)) {
        truncated = true;
        return;
      }
      byId.set(externalId, { externalId, startsAt: start, endsAt: new Date(start.getTime() + duration), ...base });
    };

    if (event.recurrenceId) {
      // An override of one occurrence: key it by the occurrence it names.
      const ridInstant = parseIcsDateTime(event.recurrenceId, householdTimeZone);
      const key = ridInstant ? dateKeyInZone(ridInstant.start, times.timeZone) : dateKeyInZone(times.start, times.timeZone);
      put(externalIdFor(uid, key), times.start);
      continue;
    }

    if (event.rrule) {
      const rule = parseRrule(event.rrule);
      if (rule) {
        const exdateKeys = new Set(
          event.exdates
            .map((prop) => parseIcsDateTime(prop, householdTimeZone))
            .filter((v): v is NonNullable<typeof v> => v !== null)
            .map((v) => dateKeyInZone(v.start, times.timeZone)),
        );
        const expanded = expandRecurrence({ startWall: parseIcsDateTime(event.dtstart!, householdTimeZone)!.wall, tz: times.timeZone, rule, window, exdateKeys });
        if (expanded.truncated) truncated = true;
        for (const start of expanded.starts) put(externalIdFor(uid, dateKeyInZone(start, times.timeZone)), start);
        continue;
      }
      // A rule we do not expand: import the first instance only, so nothing is lost silently.
    }

    // A single event: import it if it touches the window.
    if (times.end.getTime() >= window.start.getTime() && times.start.getTime() <= window.end.getTime()) {
      put(externalIdFor(uid, null), times.start);
    } else {
      skipped += 1;
    }
  }

  return { events: [...byId.values()], stats: { imported: byId.size, skipped, truncated } };
}
