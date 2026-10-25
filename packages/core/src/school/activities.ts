import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { atLocal, eachDay, weekdayOf } from "../calendar/dates";
import type { CalendarEntry, CalendarViewer } from "../calendar/projection";
import { invalidatesContext } from "../context/invalidation";
import type { Place } from "../places/provider";

/**
 * A child's teachers and their classes outside school (stories 08-010 to
 * 08-012): `school_teachers`, `child_activities`, `child_activity_notes`.
 * The child, their guardians and Admins read them; guardians and Admins
 * change them (RLS). Nothing is hard-deleted: a teacher, a class or a note is
 * stood down and keeps its history (rule 12). A class's weekly schedule is
 * what puts its sessions on the Calendar (`activityEntries`), read live, never
 * copied into `family_events`.
 */

export const TEACHER_ROLES = ["class_teacher", "subject_teacher"] as const;
export type TeacherRole = (typeof TEACHER_ROLES)[number];

/** The kinds a picker offers first (rule 20); a household's own word is kept as it is. */
export const ACTIVITY_KINDS = ["music", "dance", "sport", "martial_arts", "art", "language", "academic", "other"] as const;

export const ACTIVITY_NOTE_KINDS = ["competition", "exam", "event", "award", "note"] as const;
export type ActivityNoteKind = (typeof ACTIVITY_NOTE_KINDS)[number];

/** What a class has coming up on a day: a competition, an exam (a grading, a belt test) or an event (a performance, a match). On the Calendar. */
export const DATED_NOTE_KINDS = ["competition", "exam", "event"] as const satisfies readonly ActivityNoteKind[];
export const isDatedNote = (kind: ActivityNoteKind): boolean => (DATED_NOTE_KINDS as readonly string[]).includes(kind);

export type Teacher = {
  id: string;
  childMemberId: string;
  role: TeacherRole;
  subject: string | null;
  name: string;
  contact: string | null;
  note: string | null;
};

export type ActivityNote = {
  id: string;
  activityId: string;
  kind: ActivityNoteKind;
  title: string;
  onDate: string | null;
  /** "HH:MM" on the household's clock, for something coming up; null is all day. */
  startsAt: string | null;
  endsAt: string | null;
  detail: string | null;
  result: string | null;
};

export type Activity = {
  id: string;
  childMemberId: string;
  name: string;
  kind: string;
  description: string | null;
  teacherName: string | null;
  teacherContact: string | null;
  place: { name: string | null; placeId: string | null; address: string | null; location: { latitude: number; longitude: number } | null } | null;
  /** ISO weekdays: 1 Monday … 7 Sunday. Empty means no fixed schedule. */
  days: number[];
  /** "HH:MM" on the household's clock, or null. */
  startsAt: string | null;
  endsAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
  items: ActivityNote[];
};

const TEACHER_COLUMNS = "id, child_member_id, role, subject, name, contact, note";
const ACTIVITY_COLUMNS =
  "id, child_member_id, name, kind, description, teacher_name, teacher_contact, place_name, place_id, place_address, latitude, longitude, days, starts_at, ends_at, starts_on, ends_on, notes";
const NOTE_COLUMNS = "id, activity_id, kind, title, on_date, starts_at, ends_at, detail, result";

type Row = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const hhmm = (value: unknown): string | null => (typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null);

function toTeacher(row: Row): Teacher {
  return {
    id: row.id as string,
    childMemberId: row.child_member_id as string,
    role: row.role === "subject_teacher" ? "subject_teacher" : "class_teacher",
    subject: text(row.subject),
    name: row.name as string,
    contact: text(row.contact),
    note: text(row.note),
  };
}

function toNote(row: Row): ActivityNote {
  return {
    id: row.id as string,
    activityId: row.activity_id as string,
    kind: (ACTIVITY_NOTE_KINDS as readonly string[]).includes(row.kind as string) ? (row.kind as ActivityNoteKind) : "note",
    title: row.title as string,
    onDate: text(row.on_date),
    startsAt: hhmm(row.starts_at),
    endsAt: hhmm(row.ends_at),
    detail: text(row.detail),
    result: text(row.result),
  };
}

function toActivity(row: Row, items: ActivityNote[]): Activity {
  const latitude = row.latitude === null || row.latitude === undefined ? null : Number(row.latitude);
  const longitude = row.longitude === null || row.longitude === undefined ? null : Number(row.longitude);
  const placeName = text(row.place_name);
  const placeAddress = text(row.place_address);
  return {
    id: row.id as string,
    childMemberId: row.child_member_id as string,
    name: row.name as string,
    kind: (row.kind as string) ?? "other",
    description: text(row.description),
    teacherName: text(row.teacher_name),
    teacherContact: text(row.teacher_contact),
    place:
      placeName || placeAddress
        ? {
            name: placeName,
            placeId: text(row.place_id),
            address: placeAddress,
            location: latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
          }
        : null,
    days: Array.isArray(row.days) ? (row.days as number[]).map(Number).filter((day) => day >= 1 && day <= 7).sort((a, b) => a - b) : [],
    startsAt: hhmm(row.starts_at),
    endsAt: hhmm(row.ends_at),
    startsOn: text(row.starts_on),
    endsOn: text(row.ends_on),
    notes: text(row.notes),
    items,
  };
}

/** Every current teacher of the children this viewer may see. */
export async function listTeachers(supabase: SupabaseClient, householdId: string): Promise<Teacher[]> {
  const { data, error } = await supabase
    .from("school_teachers")
    .select(TEACHER_COLUMNS)
    .eq("household_id", householdId)
    .eq("active", true)
    .order("role")
    .order("subject", { nullsFirst: true })
    .order("name");
  if (error) throw new Error(`listTeachers failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map(toTeacher);
}

/** Every current class, with its current competitions, awards and notes, soonest first. */
/**
 * The household's children, each with the names of their own classes, for a
 * picker that offers a child's classes once that child is chosen (rule 20).
 */
export function childrenWithClasses(
  members: readonly { id: string; displayName: string; memberType: string }[],
  activities: readonly Pick<Activity, "childMemberId" | "name">[],
): { id: string; displayName: string; classes: string[] }[] {
  return members
    .filter((member) => member.memberType === "child")
    .map((kid) => ({
      id: kid.id,
      displayName: kid.displayName,
      classes: [...new Set(activities.filter((activity) => activity.childMemberId === kid.id).map((activity) => activity.name))].sort((a, b) => a.localeCompare(b)),
    }));
}

export async function listActivities(supabase: SupabaseClient, householdId: string): Promise<Activity[]> {
  const { data, error } = await supabase.from("child_activities").select(ACTIVITY_COLUMNS).eq("household_id", householdId).eq("active", true).order("name");
  if (error) throw new Error(`listActivities failed: ${error.code ?? "unknown"}`);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];
  const { data: notes, error: notesError } = await supabase
    .from("child_activity_notes")
    .select(NOTE_COLUMNS)
    .eq("household_id", householdId)
    .eq("active", true)
    .in(
      "activity_id",
      rows.map((row) => row.id as string),
    )
    .order("on_date", { ascending: false, nullsFirst: false });
  if (notesError) throw new Error(`listActivities failed: ${notesError.code ?? "unknown"}`);
  const byActivity = new Map<string, ActivityNote[]>();
  for (const note of ((notes ?? []) as Row[]).map(toNote)) byActivity.set(note.activityId, [...(byActivity.get(note.activityId) ?? []), note]);
  return rows.map((row) => toActivity(row, byActivity.get(row.id as string) ?? []));
}

function refused(error: { code?: string } | null, what: string): never {
  if (error?.code === "42501") throw ApiError.forbidden("Only the child's guardians or an Admin can change this.");
  if (error?.code === "23514") throw ApiError.badRequest("Please check the details above.");
  throw new Error(`${what} failed: ${error?.code ?? "unknown"}`);
}

export type TeacherInput = {
  householdId: string;
  childMemberId: string;
  /** Present to change a teacher already on record. */
  id?: string | null;
  role: TeacherRole;
  subject: string | null;
  name: string;
  contact?: string | null;
  note?: string | null;
};

async function saveTeacherImpl(supabase: SupabaseClient, input: TeacherInput): Promise<{ id: string }> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw ApiError.badRequest("What is the teacher's name?");
  const subject = input.role === "subject_teacher" ? input.subject?.trim().slice(0, 80) || null : null;
  if (input.role === "subject_teacher" && !subject) throw ApiError.badRequest("Which subject do they teach?");
  const row = {
    household_id: input.householdId,
    child_member_id: input.childMemberId,
    role: input.role,
    subject,
    name,
    contact: input.contact?.trim().slice(0, 160) || null,
    note: input.note?.trim().slice(0, 500) || null,
  };
  const query = input.id
    ? supabase.from("school_teachers").update(row).eq("id", input.id).eq("household_id", input.householdId).select("id").single()
    : supabase.from("school_teachers").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) refused(error, "saveTeacher");
  return { id: (data as Row).id as string };
}

async function standDownTeacherImpl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { error } = await supabase.from("school_teachers").update({ active: false }).eq("id", input.id).eq("household_id", input.householdId);
  if (error) refused(error, "standDownTeacher");
}

export type ActivityInput = {
  householdId: string;
  childMemberId: string;
  id?: string | null;
  name: string;
  kind: string;
  description?: string | null;
  teacherName?: string | null;
  teacherContact?: string | null;
  /** A place picked from the search (re-read on the server), a typed one, null to clear it, undefined to leave it. */
  place?: { picked: Place } | { typed: string } | null;
  days: number[];
  startsAt: string | null;
  endsAt: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  notes?: string | null;
};

async function saveActivityImpl(supabase: SupabaseClient, input: ActivityInput): Promise<{ id: string }> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw ApiError.badRequest("What is the class called?");
  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt) throw ApiError.badRequest("The class has to end after it starts.");
  const days = [...new Set(input.days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
  const placeColumns: Record<string, string | number | null> =
    input.place === undefined
      ? {}
      : input.place === null
        ? { place_name: null, place_id: null, place_address: null, latitude: null, longitude: null }
        : "picked" in input.place
          ? {
              place_name: input.place.picked.name.slice(0, 200),
              place_id: input.place.picked.placeId,
              place_address: input.place.picked.formattedAddress.slice(0, 300),
              latitude: Math.round(input.place.picked.latitude * 1e6) / 1e6,
              longitude: Math.round(input.place.picked.longitude * 1e6) / 1e6,
            }
          : { place_name: input.place.typed.trim().slice(0, 200) || null, place_id: null, place_address: null, latitude: null, longitude: null };
  const row = {
    household_id: input.householdId,
    child_member_id: input.childMemberId,
    name,
    kind: input.kind.trim().slice(0, 40) || "other",
    description: input.description?.trim().slice(0, 300) || null,
    teacher_name: input.teacherName?.trim().slice(0, 120) || null,
    teacher_contact: input.teacherContact?.trim().slice(0, 160) || null,
    ...placeColumns,
    days,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    starts_on: input.startsOn ?? null,
    ends_on: input.endsOn ?? null,
    notes: input.notes?.trim().slice(0, 2000) || null,
  };
  const query = input.id
    ? supabase.from("child_activities").update(row).eq("id", input.id).eq("household_id", input.householdId).select("id").single()
    : supabase.from("child_activities").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) refused(error, "saveActivity");
  return { id: (data as Row).id as string };
}

async function standDownActivityImpl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { error } = await supabase.from("child_activities").update({ active: false }).eq("id", input.id).eq("household_id", input.householdId);
  if (error) refused(error, "standDownActivity");
}

export type ActivityNoteInput = {
  householdId: string;
  activityId: string;
  id?: string | null;
  kind: ActivityNoteKind;
  title: string;
  onDate: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  detail?: string | null;
  result?: string | null;
};

async function saveActivityNoteImpl(supabase: SupabaseClient, input: ActivityNoteInput): Promise<{ id: string }> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw ApiError.badRequest("What is it?");
  const dated = isDatedNote(input.kind);
  const startsAt = dated ? input.startsAt || null : null;
  const endsAt = dated && startsAt ? input.endsAt || null : null;
  if (startsAt && endsAt && startsAt >= endsAt) throw ApiError.badRequest("It has to end after it starts.");
  const row = {
    household_id: input.householdId,
    activity_id: input.activityId,
    kind: input.kind,
    title,
    on_date: input.onDate,
    starts_at: startsAt,
    ends_at: endsAt,
    detail: input.detail?.trim().slice(0, 1000) || null,
    result: input.kind === "award" ? input.result?.trim().slice(0, 120) || null : null,
  };
  const query = input.id
    ? supabase.from("child_activity_notes").update(row).eq("id", input.id).eq("household_id", input.householdId).select("id").single()
    : supabase.from("child_activity_notes").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) refused(error, "saveActivityNote");
  return { id: (data as Row).id as string };
}

async function standDownActivityNoteImpl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { error } = await supabase.from("child_activity_notes").update({ active: false }).eq("id", input.id).eq("household_id", input.householdId);
  if (error) refused(error, "standDownActivityNote");
}

export const saveTeacher = invalidatesContext(saveTeacherImpl, (_s, input) => input.householdId);
export const standDownTeacher = invalidatesContext(standDownTeacherImpl, (_s, input) => input.householdId);
export const saveActivity = invalidatesContext(saveActivityImpl, (_s, input) => input.householdId);
export const standDownActivity = invalidatesContext(standDownActivityImpl, (_s, input) => input.householdId);
export const saveActivityNote = invalidatesContext(saveActivityNoteImpl, (_s, input) => input.householdId);
export const standDownActivityNote = invalidatesContext(standDownActivityNoteImpl, (_s, input) => input.householdId);

// --- The schedule ------------------------------------------------------------

/** The ISO weekday (1 Monday … 7 Sunday) of a local date. */
export function isoWeekday(dateKey: string): number {
  const day = weekdayOf(dateKey);
  return day === 0 ? 7 : day;
}

/** The local dates, within the range, a class meets on: its weekdays, inside its own start and end. */
export function sessionDates(activity: Pick<Activity, "days" | "startsOn" | "endsOn">, range: { from: string; to: string }): string[] {
  if (activity.days.length === 0) return [];
  const from = activity.startsOn && activity.startsOn > range.from ? activity.startsOn : range.from;
  const to = activity.endsOn && activity.endsOn < range.to ? activity.endsOn : range.to;
  if (from > to) return [];
  const days = new Set(activity.days);
  return eachDay(from, to).filter((dateKey) => days.has(isoWeekday(dateKey)));
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * A class's sessions as Calendar entries (story 08-012): one per day it
 * meets in the range, at its times on the household's clock, or all day when
 * no time was given. They are the class's, not events: opening one goes to
 * Kids & School, and changing a class changes every session.
 */
export function activityEntries(activities: readonly Activity[], viewer: CalendarViewer, range: { from: string; to: string }): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const activity of activities) {
    for (const dateKey of sessionDates(activity, range)) {
      const timed = Boolean(activity.startsAt);
      const start = atLocal(dateKey, timed ? minutesOf(activity.startsAt!) : 0, viewer.timeZone);
      const end = timed
        ? activity.endsAt
          ? atLocal(dateKey, minutesOf(activity.endsAt), viewer.timeZone)
          : new Date(start.getTime() + 60 * 60_000)
        : atLocal(dateKey, 24 * 60, viewer.timeZone);
      entries.push({
        id: `activity:${activity.id}:${dateKey}`,
        source: "activity",
        sourceId: activity.id,
        title: activity.name,
        detail: activity.place?.name ?? activity.teacherName ?? null,
        start,
        end,
        allDay: !timed,
        timeZone: viewer.timeZone,
        kind: "block",
        category: "school",
        memberIds: [activity.childMemberId],
        ownerMemberId: null,
        status: "confirmed",
        visibility: "participants",
        occurrenceDate: dateKey,
        repeats: true,
        protected: false,
        href: `/school?child=${activity.childMemberId}`,
        can: { edit: false },
      });
    }
    // What the class has on one day (a competition, an exam, an event): once, at its own time.
    for (const note of activity.items) {
      if (!isDatedNote(note.kind) || !note.onDate || note.onDate < range.from || note.onDate > range.to) continue;
      const timed = Boolean(note.startsAt);
      const start = atLocal(note.onDate, timed ? minutesOf(note.startsAt!) : 0, viewer.timeZone);
      const end = timed
        ? note.endsAt
          ? atLocal(note.onDate, minutesOf(note.endsAt), viewer.timeZone)
          : new Date(start.getTime() + 60 * 60_000)
        : atLocal(note.onDate, 24 * 60, viewer.timeZone);
      entries.push({
        id: `activity-note:${note.id}`,
        source: "activity",
        sourceId: activity.id,
        title: note.title,
        detail: activity.name,
        start,
        end,
        allDay: !timed,
        timeZone: viewer.timeZone,
        kind: "block",
        category: "school",
        memberIds: [activity.childMemberId],
        ownerMemberId: null,
        status: "confirmed",
        visibility: "participants",
        occurrenceDate: note.onDate,
        repeats: false,
        protected: false,
        href: `/school?child=${activity.childMemberId}`,
        can: { edit: false },
      });
    }
  }
  return entries;
}

/** The same class by name: "Karate" and "karate class" are one class; "Karate" and "Kathak" are not. */
export function sameActivityName(a: string, b: string): boolean {
  const plain = (value: string) => value.toLowerCase().replace(/\b(?:class|classes|lessons?|coaching|academy|club)\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const left = plain(a);
  const right = plain(b);
  return Boolean(left && right) && (left === right || left.split(" ").includes(right) || right.split(" ").includes(left));
}

/** Upcoming competitions first by date, then awards and notes newest first: what a class's opened row lists. */
export function orderedNotes(notes: readonly ActivityNote[], today: string): { upcoming: ActivityNote[]; past: ActivityNote[] } {
  const upcoming = notes.filter((note) => isDatedNote(note.kind) && note.onDate !== null && note.onDate >= today).sort((a, b) => a.onDate!.localeCompare(b.onDate!));
  const ids = new Set(upcoming.map((note) => note.id));
  const past = notes.filter((note) => !ids.has(note.id)).sort((a, b) => (b.onDate ?? "").localeCompare(a.onDate ?? ""));
  return { upcoming, past };
}
