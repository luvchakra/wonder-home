import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";

/**
 * Which school each child attends (story 02-009) — the `school_enrolments`
 * table that school items already hang off, finally written by something.
 *
 * Guardianship decides who may read or write it (RLS `may_see_child`), the
 * same rule every other school record follows. One enrolment per child and
 * school; saving the same school again updates it rather than adding a copy.
 */

export type Enrolment = { childMemberId: string; schoolName: string; grade: string | null };

export async function listEnrolments(supabase: SupabaseClient, householdId: string): Promise<Enrolment[]> {
  const { data, error } = await supabase
    .from("school_enrolments")
    .select("child_member_id, school_name, grade")
    .eq("household_id", householdId)
    .eq("active", true);
  if (error) throw new Error(`listEnrolments failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as { child_member_id: string; school_name: string; grade: string | null }[]).map((row) => ({
    childMemberId: row.child_member_id,
    schoolName: row.school_name,
    grade: row.grade,
  }));
}

async function saveEnrolmentImpl(
  supabase: SupabaseClient,
  input: { householdId: string; childMemberId: string; schoolName: string; grade?: string | null },
): Promise<void> {
  const schoolName = input.schoolName.trim().slice(0, 120);
  if (!schoolName) throw ApiError.badRequest("Which school is it?");
  const { error } = await supabase.from("school_enrolments").upsert(
    {
      household_id: input.householdId,
      child_member_id: input.childMemberId,
      school_name: schoolName,
      grade: input.grade?.trim().slice(0, 40) || null,
      active: true,
    },
    { onConflict: "child_member_id,school_name" },
  );
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the child's guardians or an Admin can record their school.");
    throw new Error(`saveEnrolment failed: ${error.code ?? "unknown"}`);
  }
}

export const saveEnrolment = invalidatesContext(saveEnrolmentImpl, (_supabase, input) => input.householdId);
