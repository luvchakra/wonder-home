import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { REMINDER_POLICIES, TUNABLE_CATEGORIES, isPresetFor, type TunableCategory } from "./policies";

/**
 * A person's own reminder timing (story 23-007): for each kind of reminder,
 * which of the policy's presets they want, and whether they want it at all.
 *
 * Read and written through their own session — `reminder_preferences_write_own`
 * keeps it theirs — and never by AI (spec §17: "should not be silently
 * overwritten by AI"). Only presets the policy offers are stored.
 */

export type ReminderPreference = { category: TunableCategory; preset: string; enabled: boolean };

export async function loadReminderPreferences(supabase: SupabaseClient, memberId: string): Promise<ReminderPreference[]> {
  const { data } = await supabase.from("reminder_preferences").select("category, preset, enabled").eq("member_id", memberId);
  const stored = new Map(((data ?? []) as { category: string; preset: string; enabled: boolean }[]).map((row) => [row.category, row]));
  return TUNABLE_CATEGORIES.map((category) => {
    const row = stored.get(category);
    return {
      category,
      preset: row && isPresetFor(category, row.preset) ? row.preset : REMINDER_POLICIES[category].defaultPreset,
      enabled: row?.enabled ?? true,
    };
  });
}

export async function saveReminderPreferences(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; preferences: readonly ReminderPreference[] },
): Promise<void> {
  for (const preference of input.preferences) {
    if (!isPresetFor(preference.category, preference.preset)) {
      throw ApiError.badRequest("Pick one of the offered timings.");
    }
  }
  const { error } = await supabase.from("reminder_preferences").upsert(
    input.preferences.map((preference) => ({
      household_id: input.householdId,
      member_id: input.memberId,
      category: preference.category,
      preset: preference.preset,
      enabled: preference.enabled,
    })),
    { onConflict: "member_id,category" },
  );
  if (error) throw new Error(`saveReminderPreferences failed: ${error.code ?? "unknown"}`);
}
