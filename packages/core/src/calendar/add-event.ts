import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { createEvent, listEvents, type CreateEventInput } from "../family/repository";
import { createSchoolItem, type CreateSchoolItemInput } from "../school/repository";
import { atLocal, localMoment } from "./dates";
import { sameTitledOnDay } from "./duplicates";

/**
 * HomeEvents' one door for anything that goes on the calendar (the owner,
 * 2026-10-22: "per design every event should be created via the HomeEvents
 * module. put guard rails in place so duplicate entries are not created from
 * various parts of the application").
 *
 * Every way an event or a school entry is added — the Calendar's Add sheet,
 * Kids & School, HomeTalk, HomeSend, a health appointment, the REST API —
 * comes through `addFamilyEvent` or `addSchoolItem`. Before anything is
 * written, the household's entries on that local day are read from both
 * tables, family events and school entries alike, and the same name, nearly
 * the same name or the same occasion by another name ("Field trip to Bounce",
 * "Bounce School Trip") is a duplicate. A duplicate is never written unless
 * the person said "add anyway" (`confirmed`); the caller is told which entry
 * is already there. `single-door.test.ts` fails CI if anything else calls the
 * raw `createEvent` or `createSchoolItem`.
 */

/** What is already on the calendar that day under this or another name for the same thing. */
export type SameEntry = { sourceId: string; title: string; start: Date; source: "event" | "school" };

export type AddResult = { kind: "added"; id: string } | { kind: "duplicate"; existing: SameEntry };

type AddOptions = {
  /** The household's IANA zone: "that day" is the household's own day. */
  timeZone: string;
  /** The person saw the duplicate and said to add it anyway. */
  confirmed?: boolean;
};

/**
 * The entry already on the household's calendar that local day, if any, read
 * through the caller's own session. Not being able to read it never blocks
 * adding, so a read failure is "nothing found".
 */
export async function sameOnCalendar(
  supabase: SupabaseClient,
  candidate: { householdId: string; title: string; date: string; timeZone: string; ignoreSourceId?: string },
): Promise<SameEntry | null> {
  const dayStart = atLocal(candidate.date, 0, candidate.timeZone);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  // A school entry with no time is stored at midnight UTC for its own day, so the read is a day wider each way.
  const from = new Date(dayStart.getTime() - 86_400_000);
  const to = new Date(dayEnd.getTime() + 86_400_000);
  try {
    const [events, school] = await Promise.all([
      listEvents(supabase, candidate.householdId, { from: dayStart, to: dayEnd }),
      supabase
        .from("school_items")
        .select("id, title, due_at, due_time_known, status")
        .eq("household_id", candidate.householdId)
        .gte("due_at", from.toISOString())
        .lte("due_at", to.toISOString())
        .neq("status", "cancelled")
        .limit(100),
    ]);
    const records = [
      ...events
        .filter((event) => event.status !== "cancelled")
        .map((event) => ({ sourceId: event.id, title: event.title, start: event.startsAt, day: event.allDay ? localMoment(event.startsAt, candidate.timeZone).dateKey : null, source: "event" as const })),
      ...((school.data ?? []) as { id: string; title: string; due_at: string; due_time_known: boolean }[]).map((item) => ({
        sourceId: item.id,
        title: item.title,
        start: new Date(item.due_at),
        day: item.due_time_known ? null : item.due_at.slice(0, 10),
        source: "school" as const,
      })),
    ];
    const same = sameTitledOnDay(records, { title: candidate.title, date: candidate.date, timeZone: candidate.timeZone, ignoreSourceId: candidate.ignoreSourceId });
    return same ? { sourceId: same.sourceId, title: same.title, start: same.start, source: same.source } : null;
  } catch {
    return null;
  }
}

/** A family event, unless it is already on the calendar that day. */
export async function addFamilyEvent(supabase: SupabaseClient, input: CreateEventInput, options: AddOptions): Promise<AddResult> {
  if (!options.confirmed) {
    const date = localMoment(new Date(input.startsAt), options.timeZone).dateKey;
    const existing = await sameOnCalendar(supabase, { householdId: input.householdId, title: input.title, date, timeZone: options.timeZone });
    if (existing) return { kind: "duplicate", existing };
  }
  const { id } = await createEvent(supabase, input);
  return { kind: "added", id };
}

/** A school entry, unless the same thing is already on the calendar that day. One with no date has no day to share. */
export async function addSchoolItem(supabase: SupabaseClient, input: CreateSchoolItemInput, options: AddOptions): Promise<AddResult> {
  if (!options.confirmed && input.dueAt) {
    // An entry with no time is stored at midnight UTC for its own day; one with a time is on the household's day.
    const date = input.dueTimeKnown === false ? input.dueAt.slice(0, 10) : localMoment(new Date(input.dueAt), options.timeZone).dateKey;
    const existing = await sameOnCalendar(supabase, { householdId: input.householdId, title: input.title, date, timeZone: options.timeZone });
    if (existing) return { kind: "duplicate", existing };
  }
  const { id } = await createSchoolItem(supabase, input);
  return { kind: "added", id };
}

/** An API caller's refusal: 409, naming the entry already there, and how to add it anyway. */
export function duplicateConflict(existing: SameEntry): ApiError {
  return ApiError.conflict(`"${existing.title}" is already on the calendar that day. Send confirmDuplicate: true to add it anyway.`, {
    existing: { id: existing.sourceId, title: existing.title, startsAt: existing.start.toISOString(), source: existing.source },
  });
}
