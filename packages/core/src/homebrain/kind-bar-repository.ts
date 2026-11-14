import type { SupabaseClient } from "@supabase/supabase-js";

import type { HomeSendKind } from "../homesend/items";
import { AUTO_ADD_PERCENTS } from "../homesend/auto-add";
import { AUTO_ADD_POLICY_NAME } from "../household/auto-add-repository";
import { BAR_KINDS, barFromHistory, effectiveBar, historyByKind, WINDOW_DAYS, type BarKind, type EffectiveBar, type KindBar } from "./kind-bar";

/**
 * Reads and stores each kind's bar (`kind-bar.ts`). `homebrain_kind_bars`
 * is written only by the HomeBrain sleep job (service role) and read by
 * every member. A missing table reads as nothing learned: 95%.
 */

type BarRow = { kind: string; percent: number; added: number; undone: number; corrected: number };

export async function listKindBars(client: SupabaseClient, householdId: string): Promise<KindBar[]> {
  const { data, error } = await client.from("homebrain_kind_bars").select("kind, percent, added, undone, corrected").eq("household_id", householdId).limit(BAR_KINDS.length);
  if (error || !data) return [];
  return (data as BarRow[])
    .filter((row) => (BAR_KINDS as readonly string[]).includes(row.kind))
    .map((row) => ({ kind: row.kind as BarKind, percent: Number(row.percent), added: Number(row.added), undone: Number(row.undone), corrected: Number(row.corrected) }));
}

/**
 * The bar an Admin chose, or null when none did. A failure to read it is the
 * highest bar, as the Admin's — the more careful answer, never a lower one.
 */
export async function loadChosenAutoAddPercent(client: SupabaseClient, householdId: string): Promise<number | null> {
  const { data, error } = await client
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .eq("name", AUTO_ADD_POLICY_NAME)
    .eq("active", true)
    .maybeSingle();
  if (error) return AUTO_ADD_PERCENTS.at(-1)!;
  if (!data) return null;
  if ((data as { rule: { auto?: unknown } | null }).rule?.auto === true) return null;
  const stored = (data as { rule: { percent?: unknown } | null }).rule?.percent;
  return AUTO_ADD_PERCENTS.find((percent) => percent === stored) ?? AUTO_ADD_PERCENTS.at(-1)!;
}

/** The bar HomeSend uses for `kind` in this household: the Admin's, the kind's learned one, or 95%. Both reads in one wave. */
export async function loadAutomationBar(client: SupabaseClient, householdId: string, kind: HomeSendKind | null): Promise<EffectiveBar> {
  const [adminPercent, learned] = await Promise.all([loadChosenAutoAddPercent(client, householdId), listKindBars(client, householdId).catch(() => [])]);
  return effectiveBar({ kind, adminPercent, learned });
}

/**
 * Works out every kind's bar from the last 90 days of HomeSend entries and
 * stores it. Service role only (the sleep job). Returns the bars stored.
 */
export async function refreshKindBars(admin: SupabaseClient, householdId: string, now: Date = new Date()): Promise<KindBar[]> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  // Corrections made on the review form or in HomeTalk are in `ai_corrections` too (evaluation/evidence.ts).
  const [{ data, error }, corrections] = await Promise.all([
    admin.from("homesend_changes").select("intake_id, domain, undone_at, corrected_at").eq("household_id", householdId).gte("created_at", since).limit(5000),
    admin.from("ai_corrections").select("source_id").eq("household_id", householdId).eq("source_type", "home_send_item").gte("created_at", since).limit(5000),
  ]);
  if (error || !data) return [];
  const correctedItems = new Set(((corrections.data ?? []) as { source_id: string | null }[]).map((row) => row.source_id).filter((id): id is string => typeof id === "string"));
  const rows = data as { intake_id: string; domain: string; undone_at: string | null; corrected_at?: string | null }[];
  const history = historyByKind(rows.map((row) => ({ domain: row.domain, undone: row.undone_at !== null, corrected: (row.corrected_at ?? null) !== null || correctedItems.has(row.intake_id) })));
  const bars: KindBar[] = [...history.entries()].map(([kind, counts]) => ({ kind, ...counts, percent: barFromHistory(counts) }));
  if (bars.length === 0) return [];
  const { error: writeError } = await admin.from("homebrain_kind_bars").upsert(
    bars.map((bar) => ({ household_id: householdId, kind: bar.kind, percent: bar.percent, added: bar.added, undone: bar.undone, corrected: bar.corrected, computed_at: now.toISOString() })),
    { onConflict: "household_id,kind" },
  );
  return writeError ? [] : bars;
}
