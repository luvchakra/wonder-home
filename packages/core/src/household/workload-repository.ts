import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { listMembers } from "../identity/households";
import type { ConfigMember } from "./configuration";
import { listResponsibilities, saveResponsibility } from "./configuration-repository";
import { findImbalances, memberLoads, suggestRebalance } from "./workload";

export { rebalanceSchema } from "./workload";

/**
 * Accepting a suggested rebalance (story 03-008): the outcome's backup becomes
 * its owner, and the owner becomes its backup. Nothing else about the outcome
 * changes, and it goes through the same validated, audited save every
 * responsibility change does.
 *
 * Idempotent: accepting a swap that is already in place changes nothing. A
 * suggestion that no longer matches the household is refused rather than
 * applied to whatever is there now.
 */
export async function acceptRebalance(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    actorMemberId: string;
    members: readonly ConfigMember[];
    outcomeKey: string;
    fromMemberId: string;
    toMemberId: string;
  },
): Promise<{ changed: boolean }> {
  const current = (await listResponsibilities(supabase, input.householdId)).find((row) => row.outcomeKey === input.outcomeKey);
  if (!current) throw ApiError.notFound("That responsibility is not in this household.");

  if (current.primaryMemberId === input.toMemberId && current.backupMemberId === input.fromMemberId) {
    return { changed: false };
  }
  if (current.primaryMemberId !== input.fromMemberId || current.backupMemberId !== input.toMemberId) {
    throw ApiError.conflict("Who owns this has changed since it was suggested. Look again at the current split.");
  }

  await saveResponsibility(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    members: input.members,
    responsibility: {
      outcomeKey: current.outcomeKey,
      primaryMemberId: input.toMemberId,
      backupMemberId: input.fromMemberId,
      aiMode: current.aiMode,
      priority: current.priority,
    },
  });
  return { changed: true };
}

/** The household's loads and suggested swaps, read the way the Responsibilities screen reads them. */
export async function householdWorkload(supabase: SupabaseClient, householdId: string, ownerMemberId: string | null) {
  const [members, { data, error }] = await Promise.all([
    listMembers(supabase, householdId, ownerMemberId),
    supabase
      .from("responsibilities")
      .select("outcome_key, primary_member_id, backup_member_id, playbook_items(name, cadence)")
      .eq("household_id", householdId),
  ]);
  if (error) throw new Error(`householdWorkload failed: ${error.code ?? "unknown"}`);

  const workloadMembers = members
    .filter((member) => member.status === "active")
    .map((member) => ({ id: member.id, displayName: member.displayName, memberType: member.memberType }));
  const outcomes = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const embedded = (Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items) as
      | { name?: string; cadence?: Record<string, unknown> }
      | null;
    const unit = embedded?.cadence?.unit ?? embedded?.cadence?.frequency ?? embedded?.cadence?.every;
    return {
      outcomeKey: row.outcome_key as string,
      name: embedded?.name ?? (row.outcome_key as string).replace(/[._]/g, " "),
      primaryMemberId: (row.primary_member_id as string | null) ?? null,
      backupMemberId: (row.backup_member_id as string | null) ?? null,
      cadenceUnit: typeof unit === "string" ? unit : null,
    };
  });
  const loads = memberLoads(workloadMembers, outcomes);
  return { loads, imbalances: findImbalances(loads), suggestions: suggestRebalance(workloadMembers, outcomes) };
}
