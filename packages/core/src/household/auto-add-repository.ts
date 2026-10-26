import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "./configuration-repository";
import { asAutoAddPercent, AUTO_ADD_PERCENTS, DEFAULT_AUTO_ADD_PERCENT, type AutoAddPercent } from "../homesend/auto-add";

/**
 * The household's bar for HomeSend adding on its own (`auto-add.ts`), kept
 * like "Ask before acting on what I say" (`conversation/consent-repository.ts`):
 * one versioned row in `policies`, category `ai_autonomy`, so a change is
 * audited and admins only. A failure to read it lands on the highest bar —
 * the more careful answer — never on a lower one.
 */

export const AUTO_ADD_POLICY_NAME = "Add from HomeSend only when more sure than";

export async function loadAutoAddPercent(supabase: SupabaseClient, householdId: string): Promise<AutoAddPercent> {
  const { data, error } = await supabase
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .eq("name", AUTO_ADD_POLICY_NAME)
    .eq("active", true)
    .maybeSingle();
  if (error) return AUTO_ADD_PERCENTS.at(-1)!;
  if (!data) return DEFAULT_AUTO_ADD_PERCENT;
  // A stored bar WonderHome doesn't offer is read like one that can't be read: the highest.
  const stored = (data as { rule: { percent?: unknown } | null }).rule?.percent;
  return AUTO_ADD_PERCENTS.some((percent) => percent === stored) ? asAutoAddPercent(stored) : AUTO_ADD_PERCENTS.at(-1)!;
}

export async function saveAutoAddPercent(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; percent: AutoAddPercent },
): Promise<{ id: string; downstream: string[] }> {
  return savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "ai_autonomy",
    name: AUTO_ADD_POLICY_NAME,
    rule: { percent: input.percent },
  });
}
