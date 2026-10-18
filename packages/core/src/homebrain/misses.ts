import type { SupabaseClient } from "@supabase/supabase-js";

import { STORE_MAX_AGE_MS } from "./context-store";

/**
 * How whole HomeBrain's knowledge is (HomeBrain 4.0 §3.8, story 14-031), for
 * the AI quality page. Counted from closed words only: `homebrain_misses`
 * (which parts of the home a deeper look read, and whether it found what the
 * stored context lacked) and `household_context`'s timestamps. A domain with
 * misses is a builder that leaves something out, or a write path that forgets
 * `invalidatesContext` — a number to fix, not a household told "no".
 */
export type HomeBrainKeeping = {
  /** Deeper looks taken, and how many found something the stored context did not have. */
  deeperLooks: { total: number; found: number };
  /** Of the looks that found something, how many read each part of the home. */
  foundByDomain: Record<string, number>;
  /** Why each look was taken. */
  byTrigger: Record<string, number>;
  /** Stored contexts, how many are behind (a write since their build, or over an hour old), and the oldest lag. */
  stores: { total: number; behind: number; oldestLagMinutes: number | null };
};

type MissRow = { domains: string[] | null; trigger: string; found: boolean };
type StoreRow = { built_at: string; stale_since: string | null };

/** Pure: the same rows always give the same numbers. */
export function summarizeKeeping(misses: readonly MissRow[], stores: readonly StoreRow[], now: Date): HomeBrainKeeping {
  const foundByDomain: Record<string, number> = {};
  const byTrigger: Record<string, number> = {};
  let found = 0;
  for (const miss of misses) {
    byTrigger[miss.trigger] = (byTrigger[miss.trigger] ?? 0) + 1;
    if (!miss.found) continue;
    found += 1;
    for (const domain of miss.domains ?? []) foundByDomain[domain] = (foundByDomain[domain] ?? 0) + 1;
  }
  let behind = 0;
  let oldest: number | null = null;
  for (const store of stores) {
    const builtAt = Date.parse(store.built_at);
    const stale = store.stale_since !== null && Date.parse(store.stale_since) >= builtAt;
    const old = now.getTime() - builtAt > STORE_MAX_AGE_MS;
    if (!stale && !old) continue;
    behind += 1;
    const lag = now.getTime() - (stale ? Date.parse(store.stale_since!) : builtAt);
    oldest = Math.max(oldest ?? 0, lag);
  }
  return {
    deeperLooks: { total: misses.length, found },
    foundByDomain,
    byTrigger,
    stores: { total: stores.length, behind, oldestLagMinutes: oldest === null ? null : Math.round(oldest / 60_000) },
  };
}

export async function loadHomeBrainKeeping(admin: SupabaseClient, options: { windowDays: number; now?: Date }): Promise<HomeBrainKeeping | null> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.windowDays * 86_400_000).toISOString();
  const [misses, stores] = await Promise.all([
    admin.from("homebrain_misses").select("domains, trigger, found").gte("created_at", since).limit(50_000),
    admin.from("household_context").select("built_at, stale_since").limit(50_000),
  ]);
  // Before the HomeBrain 4.0 migration there is nothing to count.
  if (misses.error || stores.error) return null;
  return summarizeKeeping((misses.data ?? []) as MissRow[], (stores.data ?? []) as StoreRow[], now);
}
