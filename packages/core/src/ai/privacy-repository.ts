import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "../household/configuration-repository";
import {
  DEFAULT_DATA_USE,
  dataUseFromRule,
  type ContentClass,
  type DataUsePolicy,
} from "./privacy";

/**
 * Where a household's AI data-use agreement lives (story 15-005).
 *
 * In `policies`, under the `privacy` category, as one more versioned
 * household rule — not in a settings blob and not in a column of its own.
 * Three things follow from that, and all three are the reason:
 *
 *   - It is versioned. What a household had agreed to when something was sent
 *     stays knowable afterwards, which is the only way to answer the question
 *     anybody would actually ask later.
 *   - It is audited, because `savePolicy` audits. A consent change with no
 *     record of who made it is not a consent record.
 *   - It is read on the server, every time. A screen cannot cache its way
 *     into a more permissive answer.
 */

/** The one name this policy has. Fixed, because the reader looks it up by it. */
export const DATA_USE_POLICY_NAME = "AI data use";

type Row = Record<string, unknown>;

/**
 * The household's agreement, or the conservative default.
 *
 * Every failure path lands on the default rather than on something
 * permissive: a database that will not answer must not be the reason a
 * child's information reaches a provider.
 */
export async function loadDataUse(
  supabase: SupabaseClient,
  householdId: string,
): Promise<DataUsePolicy> {
  const { data, error } = await supabase
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "privacy")
    .eq("name", DATA_USE_POLICY_NAME)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return DEFAULT_DATA_USE;

  return dataUseFromRule((data as Row).rule);
}

/**
 * Records what a household has agreed to.
 *
 * Goes through `savePolicy`, so it is a new version rather than an edit, it
 * is refused for anyone who is not an administrator by the same RLS policy
 * that governs every other household rule, and it lands in the audit trail.
 */
export async function saveDataUse(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; policy: DataUsePolicy },
): Promise<{ id: string; downstream: string[] }> {
  const { policy } = input;

  return savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "privacy",
    name: DATA_USE_POLICY_NAME,
    rule: {
      allowProviderContent: policy.allowProviderContent,
      allowedProviders: [...policy.allowedProviders],
      allowedClasses: [...policy.allowedClasses] satisfies ContentClass[],
      allowRetention: policy.allowRetention,
      maxItems: policy.maxItems,
    },
  });
}
