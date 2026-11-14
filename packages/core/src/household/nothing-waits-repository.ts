import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "./configuration-repository";

/**
 * The two "Nothing waits" decisions an Admin can switch back (the owner,
 * 2026-11-14: "make each decision reversible by an Admin setting"). Kept like
 * the daily tidy's switch (`homesend-tidy-repository.ts`): one versioned row
 * each in `policies`, category `ai_autonomy`, so a change is audited and
 * Admins only.
 *
 *   - "Remind about entries still Checking" (decision 3). On: a Checking
 *     entry reminds as usual, marked "not yet confirmed" (money: "check before
 *     paying"). Off: its reminders wait until it is confirmed (the 2026-11-03
 *     rule).
 *   - "Apply a question's default after a day" (decision 4). On: a question
 *     nobody answers applies its stated default after 24 hours. Off: it
 *     closes at 48 hours with nothing done, and what it asked about stays as it
 *     was.
 *
 * Both on unless an Admin turned them off: anything but a stored `false` is on.
 * A failure to read is `null`; callers pick the careful answer (reminders on,
 * no default applied that pass).
 */

export const REMIND_CHECKING_POLICY_NAME = "Remind about entries still Checking";
export const APPLY_DEFAULTS_POLICY_NAME = "Apply a question's default after a day";

export type NothingWaitsSwitch = "remind_checking" | "apply_defaults";
const NAMES: Record<NothingWaitsSwitch, string> = { remind_checking: REMIND_CHECKING_POLICY_NAME, apply_defaults: APPLY_DEFAULTS_POLICY_NAME };

export type NothingWaits = { remindChecking: boolean | null; applyDefaults: boolean | null };

export async function loadNothingWaits(supabase: SupabaseClient, householdId: string): Promise<NothingWaits> {
  const { data, error } = await supabase
    .from("policies")
    .select("name, rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .in("name", [REMIND_CHECKING_POLICY_NAME, APPLY_DEFAULTS_POLICY_NAME])
    .eq("active", true)
    .limit(4);
  if (error || !data) return { remindChecking: null, applyDefaults: null };
  const rows = data as { name: string; rule: { on?: unknown } | null }[];
  const on = (name: string) => rows.find((row) => row.name === name)?.rule?.on !== false;
  return { remindChecking: on(REMIND_CHECKING_POLICY_NAME), applyDefaults: on(APPLY_DEFAULTS_POLICY_NAME) };
}

export async function saveNothingWaits(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; which: NothingWaitsSwitch; on: boolean },
): Promise<{ id: string; downstream: string[] }> {
  return savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "ai_autonomy",
    name: NAMES[input.which],
    rule: { on: input.on },
  });
}
