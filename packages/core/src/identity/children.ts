import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { ageBandFor, needsAgeReview, parseDateOfBirth, type AgeBand } from "./age";

/**
 * Child profiles (story 01-004).
 *
 * A child is a member of the household without being an account holder, so
 * nothing here requires the child to have an email address or a session.
 * Guardianship is a link rather than an attribute: a child may have several
 * guardians, and a guardian several children.
 */

export type ChildProfile = {
  memberId: string;
  displayName: string;
  dateOfBirth: string | null;
  /** Derived on read, never stored — see identity/age.ts. */
  ageBand: AgeBand | null;
  /** True once a child reaches adulthood, so the household can revisit access. */
  needsAgeReview: boolean;
  guardianMemberIds: string[];
};

export type CreateChildInput = {
  householdId: string;
  displayName: string;
  dateOfBirth?: string | null;
  guardianMemberIds?: string[];
};

export async function createChildMember(
  supabase: SupabaseClient,
  input: CreateChildInput,
): Promise<{ memberId: string }> {
  if (input.dateOfBirth && !parseDateOfBirth(input.dateOfBirth)) {
    throw ApiError.badRequest("Date of birth must be a real calendar date (YYYY-MM-DD).");
  }

  const { data, error } = await supabase.rpc("create_child_member", {
    p_household_id: input.householdId,
    p_display_name: input.displayName,
    p_date_of_birth: input.dateOfBirth ?? null,
    p_guardian_member_ids: input.guardianMemberIds ?? null,
  });

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only a household administrator can add a child.");
    }
    throw new Error(`createChildMember failed: ${error.code ?? "unknown"}`);
  }

  return { memberId: data as string };
}

/** The household's children, with their age band derived at read time. */
export async function listChildren(
  supabase: SupabaseClient,
  householdId: string,
  now: Date = new Date(),
): Promise<ChildProfile[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, date_of_birth, member_guardians!member_guardians_child_member_id_fkey(guardian_member_id)")
    .eq("household_id", householdId)
    .eq("member_type", "child")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listChildren failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row) => {
    const dateOfBirth = (row.date_of_birth as string | null) ?? null;
    const parsed = parseDateOfBirth(dateOfBirth);

    return {
      memberId: row.id as string,
      displayName: row.display_name as string,
      dateOfBirth,
      ageBand: ageBandFor(parsed, now),
      needsAgeReview: needsAgeReview(parsed, now),
      guardianMemberIds: (
        (row.member_guardians ?? []) as { guardian_member_id: string }[]
      ).map((link) => link.guardian_member_id),
    };
  });
}
