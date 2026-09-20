import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { Engagement } from "./helpers";

/**
 * Writing a househelper's arrangement (module 07).
 *
 * Nothing here is about performance. A profile is how the household relates
 * to the person, a pattern is when they are normally around, and an exception
 * is one day that differs. None of it is checked against anything they did.
 */

export async function saveHelperProfile(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; engagement: Engagement; startedOn: string | null; notes: string | null },
): Promise<void> {
  const { error } = await supabase.from("helper_profiles").upsert(
    {
      household_id: input.householdId,
      member_id: input.memberId,
      engagement: input.engagement,
      started_on: input.startedOn,
      notes: input.notes,
    },
    { onConflict: "member_id" },
  );

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can change a helper's arrangement.");
    throw new Error(`saveHelperProfile failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * Replaces a member's weekly pattern with the one given. The whole pattern is
 * stated at once, so the form can show every day and the household is never
 * left with Tuesday from last year and Thursday from this one.
 */
export async function replaceAvailabilityPattern(
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
export async function recordAvailabilityException(
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
