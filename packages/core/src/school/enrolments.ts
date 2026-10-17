import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { hoursFromRow, type DayHours } from "../household/day-hours";
import type { Place } from "../places/provider";

/**
 * Which school each child attends (story 02-009) — the `school_enrolments`
 * table that school items already hang off, finally written by something.
 *
 * Guardianship decides who may read or write it (RLS `may_see_child`), the
 * same rule every other school record follows. One enrolment per child and
 * school; saving the same school again updates it rather than adding a copy.
 */

export type Enrolment = {
  childMemberId: string;
  schoolName: string;
  grade: string | null;
  /** Where the school is, when it was picked from a place search. */
  placeId?: string | null;
  schoolAddress?: string | null;
  /** The school's point, when it was picked from a place search: what HomePlaces looks near. */
  location?: { latitude: number; longitude: number } | null;
  /** When the school day starts and ends for this child; what "after school" means. */
  hours?: DayHours | null;
};

export async function listEnrolments(supabase: SupabaseClient, householdId: string): Promise<Enrolment[]> {
  const { data, error } = await supabase
    .from("school_enrolments")
    .select("child_member_id, school_name, grade, place_id, school_address, latitude, longitude, starts_at, ends_at")
    .eq("household_id", householdId)
    .eq("active", true);
  if (error) throw new Error(`listEnrolments failed: ${error.code ?? "unknown"}`);
  type Row = {
    child_member_id: string;
    school_name: string;
    grade: string | null;
    place_id: string | null;
    school_address: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  };
  return ((data ?? []) as Row[]).map((row) => ({
    childMemberId: row.child_member_id,
    schoolName: row.school_name,
    grade: row.grade,
    placeId: row.place_id,
    schoolAddress: row.school_address,
    location: row.latitude !== null && row.longitude !== null ? { latitude: Number(row.latitude), longitude: Number(row.longitude) } : null,
    hours: hoursFromRow(row.starts_at, row.ends_at),
  }));
}

async function saveEnrolmentImpl(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    childMemberId: string;
    schoolName: string;
    grade?: string | null;
    /** The school as picked from a place search, already re-read on the server. Its name wins over `schoolName`. */
    place?: Place | null;
    /** This is the child's school now: any other school on record for them stops being current (kept, not deleted). */
    only?: boolean;
    /** The school day's hours; null clears them, left alone when not given. */
    hours?: DayHours | null;
  },
): Promise<void> {
  const schoolName = (input.place?.name ?? input.schoolName).trim().slice(0, 120);
  if (!schoolName) throw ApiError.badRequest("Which school is it?");
  const { error } = await supabase.from("school_enrolments").upsert(
    {
      household_id: input.householdId,
      child_member_id: input.childMemberId,
      school_name: schoolName,
      ...(input.grade !== undefined ? { grade: input.grade?.trim().slice(0, 40) || null } : {}),
      // Left alone when the caller says nothing about the place; null clears it.
      ...(input.place !== undefined
        ? {
            place_id: input.place?.placeId ?? null,
            school_address: input.place?.formattedAddress.trim().slice(0, 300) ?? null,
            latitude: input.place ? Math.round(input.place.latitude * 1e6) / 1e6 : null,
            longitude: input.place ? Math.round(input.place.longitude * 1e6) / 1e6 : null,
          }
        : {}),
      ...(input.hours !== undefined ? { starts_at: input.hours?.starts ?? null, ends_at: input.hours?.ends ?? null } : {}),
      active: true,
    },
    { onConflict: "child_member_id,school_name" },
  );
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the child's guardians or an Admin can record their school.");
    throw new Error(`saveEnrolment failed: ${error.code ?? "unknown"}`);
  }
  if (input.only) {
    const { error: retireError } = await supabase
      .from("school_enrolments")
      .update({ active: false })
      .eq("household_id", input.householdId)
      .eq("child_member_id", input.childMemberId)
      .neq("school_name", schoolName)
      .eq("active", true);
    if (retireError) throw new Error(`saveEnrolment failed: ${retireError.code ?? "unknown"}`);
  }
}

export const saveEnrolment = invalidatesContext(saveEnrolmentImpl, (_supabase, input) => input.householdId);

/**
 * A child's school day, set on whichever school is theirs now — from Family
 * or Settings, where the school itself is not re-picked. Nothing happens
 * when no school is on record; the caller says so.
 */
async function setSchoolHoursImpl(
  supabase: SupabaseClient,
  input: { householdId: string; childMemberId: string; hours: DayHours | null },
): Promise<{ updated: number }> {
  const { data, error } = await supabase
    .from("school_enrolments")
    .update({ starts_at: input.hours?.starts ?? null, ends_at: input.hours?.ends ?? null })
    .eq("household_id", input.householdId)
    .eq("child_member_id", input.childMemberId)
    .eq("active", true)
    .select("id");
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the child's guardians or an Admin can change their school hours.");
    throw new Error(`setSchoolHours failed: ${error.code ?? "unknown"}`);
  }
  return { updated: (data ?? []).length };
}

export const setSchoolHours = invalidatesContext(setSchoolHoursImpl, (_supabase, input) => input.householdId);
