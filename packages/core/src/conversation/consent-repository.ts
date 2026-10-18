import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "../household/configuration-repository";

/**
 * "Ask before acting on what I say" (HomeBrain 4.0 §3.9, story 14-025).
 *
 * Off by default: a clear request in HomeTalk is done at once, with an undo.
 * A household that wants to be asked first turns it on in Settings → AI
 * Assistant, and every everyday change becomes one question in the
 * conversation instead.
 *
 * Kept like the data-use agreement (`ai/privacy-repository.ts`): one more
 * versioned row in `policies`, category `ai_autonomy`, so a change is
 * audited, admins only, and read on the server every turn. Any failure to
 * read it lands on "ask first" — the more careful answer — never on "act".
 */

export const CONFIRM_REQUESTED_POLICY_NAME = "Ask before acting on what I say";

export async function loadConfirmRequested(supabase: SupabaseClient, householdId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .eq("name", CONFIRM_REQUESTED_POLICY_NAME)
    .eq("active", true)
    .maybeSingle();
  if (error) return true;
  if (!data) return false;
  return (data as { rule: { confirm?: unknown } | null }).rule?.confirm === true;
}

export async function saveConfirmRequested(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; confirm: boolean },
): Promise<{ id: string; downstream: string[] }> {
  return savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "ai_autonomy",
    name: CONFIRM_REQUESTED_POLICY_NAME,
    rule: { confirm: input.confirm },
  });
}
