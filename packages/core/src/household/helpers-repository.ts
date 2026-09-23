import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { Engagement } from "./helpers";
import { invalidatesContext } from "../context/invalidation";

/**
 * Writing a househelper's arrangement (module 07).
 *
 * Nothing here is about performance. A profile is how the household relates
 * to the person, a pattern is when they are normally around, and an exception
 * is one day that differs. None of it is checked against anything they did.
 */

/**
 * A new engagement for a helper — a second, distinct arrangement (a
 * different kind of help, its own start date and notes) is a separate row,
 * not an overwrite of whatever the person already has recorded.
 */
async function createHelperEngagementImpl(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; engagement: Engagement; startedOn: string | null; notes: string | null },
): Promise<void> {
  const { error } = await supabase.from("helper_profiles").insert({
    household_id: input.householdId,
    member_id: input.memberId,
    engagement: input.engagement,
    started_on: input.startedOn,
    notes: input.notes,
  });

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can add a helper's arrangement.");
    throw new Error(`createHelperEngagement failed: ${error.code ?? "unknown"}`);
  }
}

/** Changing one already-recorded engagement — never touches any other engagement the same person has. */
async function updateHelperEngagementImpl(
  supabase: SupabaseClient,
  input: { id: string; householdId: string; engagement: Engagement; startedOn: string | null; notes: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("helper_profiles")
    .update({ engagement: input.engagement, started_on: input.startedOn, notes: input.notes })
    .eq("id", input.id)
    .eq("household_id", input.householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can change a helper's arrangement.");
    throw new Error(`updateHelperEngagement failed: ${error.code ?? "unknown"}`);
  }
}

/** Removing one engagement — the person and their other engagements, if any, are untouched. */
async function removeHelperEngagementImpl(
  supabase: SupabaseClient,
  input: { id: string; householdId: string },
): Promise<void> {
  const { error } = await supabase
    .from("helper_profiles")
    .delete()
    .eq("id", input.id)
    .eq("household_id", input.householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can remove a helper's arrangement.");
    throw new Error(`removeHelperEngagement failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * Replaces a member's weekly pattern with the one given. The whole pattern is
 * stated at once, so the form can show every day and the household is never
 * left with Tuesday from last year and Thursday from this one.
 */
async function replaceAvailabilityPatternImpl(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; windows: { dayOfWeek: number; startTime: string; endTime: string }[] },
): Promise<void> {
  const { error: clearError } = await supabase
    .from("member_availability")
    .delete()
    .eq("household_id", input.householdId)
    .eq("member_id", input.memberId);
  if (clearError) {
    if (clearError.code === "42501") throw ApiError.forbidden("Only the person themselves or a household administrator can set this pattern.");
    throw new Error(`replaceAvailabilityPattern failed: ${clearError.code ?? "unknown"}`);
  }

  if (input.windows.length === 0) return;

  const { error } = await supabase.from("member_availability").insert(
    input.windows.map((window) => ({
      household_id: input.householdId,
      member_id: input.memberId,
      day_of_week: window.dayOfWeek,
      start_time: window.startTime,
      end_time: window.endTime,
      source: "stated",
    })),
  );
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the person themselves or a household administrator can set this pattern.");
    throw new Error(`replaceAvailabilityPattern failed: ${error.code ?? "unknown"}`);
  }
}

/** One day that differs from the pattern: away, or an extra day. */
async function recordAvailabilityExceptionImpl(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; onDate: string; available: boolean; reason: string | null },
): Promise<void> {
  const { error } = await supabase.from("availability_exceptions").upsert(
    {
      household_id: input.householdId,
      member_id: input.memberId,
      on_date: input.onDate,
      available: input.available,
      reason: input.reason,
    },
    { onConflict: "member_id,on_date" },
  );

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the person themselves or a household administrator can record this.");
    throw new Error(`recordAvailabilityException failed: ${error.code ?? "unknown"}`);
  }
}

// Every write forgets the household's cached context once it succeeds, so
// the next HomeTalk answer sees the change (Wave 1 §14).
export const createHelperEngagement = invalidatesContext(createHelperEngagementImpl, (_supabase, input) => input.householdId);
export const updateHelperEngagement = invalidatesContext(updateHelperEngagementImpl, (_supabase, input) => input.householdId);
export const removeHelperEngagement = invalidatesContext(removeHelperEngagementImpl, (_supabase, input) => input.householdId);
export const replaceAvailabilityPattern = invalidatesContext(replaceAvailabilityPatternImpl, (_supabase, input) => input.householdId);
export const recordAvailabilityException = invalidatesContext(recordAvailabilityExceptionImpl, (_supabase, input) => input.householdId);
