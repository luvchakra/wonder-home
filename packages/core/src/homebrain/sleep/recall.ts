import type { SupabaseClient } from "@supabase/supabase-js";

import { routeToProvider, type DataUsePolicy } from "../../ai/privacy";
import { log } from "../../observability/logger";
import { embedderFor, semanticMatches } from "./embeddings";

/**
 * HomeBrain Sleep on a turn: what a question is close to in meaning, and
 * which memories an answer used (so they stay strong and never rest).
 *
 * Both stay off the critical path. Meaning starts alongside the turn's
 * other reads and is given at most `SEMANTIC_BUDGET_MS`; past that, or on
 * any failure, the turn answers by words as it always has. Recall is counted
 * after the response.
 */

export const SEMANTIC_BUDGET_MS = 900;

export async function meaningForTurn(
  admin: SupabaseClient,
  input: { householdId: string; question: string; names: readonly string[]; policy: DataUsePolicy },
): Promise<ReadonlyMap<string, number>> {
  const work = (async () => {
    const embedder = await embedderFor(input.householdId);
    // The question's own words may leave only as the household's policy lets anything leave.
    if (!embedder || !routeToProvider({ provider: embedder.provider, keySource: "household", policy: input.policy, hasContent: true }).ok) return new Map<string, number>();
    return semanticMatches(admin, { householdId: input.householdId, embedder, question: input.question, names: input.names });
  })().catch(() => new Map<string, number>());
  const timeout = new Promise<Map<string, number>>((resolve) => setTimeout(() => resolve(new Map()), SEMANTIC_BUDGET_MS));
  return Promise.race([work, timeout]);
}

/** The memories behind the facts an answer stood on, by id: at most ten. */
export function recalledMemoryIds(facts: readonly { relevant: boolean; itemId: string | null }[]): string[] {
  return [...new Set(facts.filter((fact) => fact.relevant && fact.itemId?.startsWith("memory:")).map((fact) => fact.itemId!.slice("memory:".length)))].slice(0, 10);
}

export async function recordRecall(admin: SupabaseClient, householdId: string, memoryIds: readonly string[]): Promise<void> {
  if (memoryIds.length === 0) return;
  const { error } = await admin.rpc("homebrain_recalled", { p_household_id: householdId, p_memory_ids: [...memoryIds] });
  if (error && error.code !== "PGRST202") log.warn("homebrain recall count failed", { reason: error.code ?? "unknown", allow: ["reason"] });
}
