import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "./configuration-repository";
import { NO_DIRECT_ADD, type DirectAdd, type DirectAddArea } from "../homesend/auto-add";

/**
 * "Add money entries directly" and "Add health entries directly" (the owner,
 * 2026-10-26; `homesend/auto-add.ts` `DirectAdd`), kept like the bar
 * (`auto-add-repository.ts`): one versioned row each in `policies`, category
 * `ai_autonomy`, so a change is audited and admins only. Anything but a
 * stored `true` is off, and a failure to read them is off — the careful answer.
 */

export const DIRECT_ADD_POLICY_NAMES: Record<DirectAddArea, string> = {
  money: "Add bills and receipts from HomeSend directly",
  health: "Add health documents from HomeSend directly",
};

export async function loadDirectAdd(supabase: SupabaseClient, householdId: string): Promise<DirectAdd> {
  const { data, error } = await supabase
    .from("policies")
    .select("name, rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .in("name", Object.values(DIRECT_ADD_POLICY_NAMES))
    .eq("active", true)
    .limit(4);
  if (error || !data) return NO_DIRECT_ADD;
  const on = (area: DirectAddArea) =>
    (data as { name: string; rule: { on?: unknown } | null }[]).some((row) => row.name === DIRECT_ADD_POLICY_NAMES[area] && row.rule?.on === true);
  return { money: on("money"), health: on("health") };
}

export async function saveDirectAdd(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; area: DirectAddArea; on: boolean },
): Promise<{ id: string; downstream: string[] }> {
  return savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "ai_autonomy",
    name: DIRECT_ADD_POLICY_NAMES[input.area],
    rule: { on: input.on },
  });
}
