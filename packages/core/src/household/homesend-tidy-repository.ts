import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "./configuration-repository";

/**
 * "Tidy up items that no longer apply" (the owner, 2026-11-03): whether
 * HomeSend's daily tidy (`homesend/tidy.ts`) may archive waiting items whose
 * day has passed, that are already on record, or that a newer one replaced.
 * Kept like "Add directly" (`direct-add-repository.ts`): one versioned row in
 * `policies`, category `ai_autonomy`, so a change is audited and Admins only.
 *
 * On unless an Admin turned it off: anything but a stored `false` is on. A
 * failure to read it is `null`, and the tidy then does nothing that day — the
 * careful answer — while the screen shows the default.
 */

export const HOMESEND_TIDY_POLICY_NAME = "Tidy up HomeSend items that no longer apply";

export async function loadHomeSendTidy(supabase: SupabaseClient, householdId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .eq("name", HOMESEND_TIDY_POLICY_NAME)
    .eq("active", true)
    .limit(1);
  if (error || !data) return null;
  const rule = (data as { rule: { on?: unknown } | null }[])[0]?.rule;
  return rule?.on !== false;
}

export async function saveHomeSendTidy(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; on: boolean },
): Promise<{ id: string; downstream: string[] }> {
  return savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "ai_autonomy",
    name: HOMESEND_TIDY_POLICY_NAME,
    rule: { on: input.on },
  });
}
