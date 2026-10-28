import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import {
  DEFAULT_RETENTION_WINDOW_DAYS,
  MIN_RETENTION_WINDOW_DAYS,
  loadRetentionWindows,
} from "./retention-window-repository";

/**
 * Periodic cleanup of passed household ephemera (the owner, 2026-10-28; design
 * in `docs/data-retention.md`).
 *
 * Entries that existed only so the household would not forget a dated, upcoming
 * thing stop being load-bearing once that thing has passed and been handled.
 * This marks such rows `soft_deleted_at = now` — a reversible claim — after
 * they are older than the household's retention window. It never hard-deletes:
 * the irreversible purge is a separate, gated step (`purgeSoftDeleted`) that
 * does not run against live data in phase 1.
 *
 * It is the companion of `purge.ts`. `purge.ts` applies the *platform*
 * schedule to system-inferred data and hard-deletes on a fixed window; this
 * applies the *household's* own window to records a person created, and only
 * ever soft-deletes. Both run from the same nightly `/platform/retention`
 * sweep, on the admin client, across every household at once — which is exactly
 * the work that must never be reachable from a household's own session.
 *
 * The invariants (all in the design doc):
 *  - **Never clean health, allergy, safety, financial or purchase history, or a
 *    child's school work.** Those tables are not in `CLEANUP_SPECS` at all.
 *  - **Idempotent.** Every pass only touches rows still `soft_deleted_at is
 *    null`, so running twice the same night changes nothing new.
 *  - **Bounded.** A fixed number of households per run, a fixed batch per table.
 *  - **Fail-safe to keep.** If the windows cannot be read, the run is skipped;
 *    a household whose window reads as "off" is skipped.
 *  - **Never orphans or resurrects.** Soft-delete leaves the row in place, so
 *    inbound foreign keys are untouched, and the targeted rows are older than
 *    every reminder/notice source read's window, so no stray reminder is left
 *    or regenerated (design §6).
 */

const MS_PER_DAY = 86_400_000;
/** Households touched per run; the rest wait for the next night. */
const MAX_HOUSEHOLDS = 200;
/** Rows a single (household, table) pass may mark, so no scan is unbounded. */
const BATCH = 500;

/**
 * The irreversible hard purge is OFF (guardrail G7). It will not run against
 * live data until the owner confirms the policy in `docs/data-retention.md`
 * (question Q4). `purgeSoftDeleted` no-ops while this is false, and nothing in
 * phase 1 wires it into the live sweep.
 */
export const RETENTION_PURGE_ENABLED = false;

export type CleanupSpec = {
  /** Stable name recorded in the audit trail. */
  category: string;
  table: string;
  /** The column the row's age is measured from. */
  ageColumn: string;
  /** True when the column is a `date` (compare to YYYY-MM-DD, not a timestamp). */
  dateOnly?: boolean;
};

/**
 * The tables cleaned, and why each is safe (design §4.2). Only the phase-1
 * categories are enabled; the rest are staged in the design doc and get their
 * own `soft_deleted_at` column, indexes and reader filters when enabled.
 *
 * `availability_exceptions`: a helper's day off. A past `on_date` is the
 * "passed" signal; the row has no inbound foreign keys, so nothing is orphaned.
 * `family_event_changes`: a server-only change log (no session reads it),
 * `excluded` from the knowledge index; old rows are pure history.
 */
export const CLEANUP_SPECS: readonly CleanupSpec[] = [
  { category: "availability_exceptions", table: "availability_exceptions", ageColumn: "on_date", dateOnly: true },
  { category: "family_event_changes", table: "family_event_changes", ageColumn: "created_at" },
];

export type CleanupOutcome = {
  category: string;
  /** Rows soft-deleted this run. */
  marked: number;
  /** Set when this spec could not be swept; the rest still are. */
  error?: string;
};

export type CleanupSummary = {
  households: number;
  marked: number;
  outcomes: CleanupOutcome[];
  skipped?: "windows_unreadable";
};

const NOTHING: CleanupSummary = { households: 0, marked: 0, outcomes: [] };

/** `now` minus `days`, as the string the spec's column compares against. */
function cutoff(now: Date, days: number, dateOnly: boolean): string {
  const at = new Date(now.getTime() - days * MS_PER_DAY);
  return dateOnly ? at.toISOString().slice(0, 10) : at.toISOString();
}

/**
 * The households with any row old enough to consider, across all specs, bounded.
 * Uses the floor window, not each household's own — the per-household window
 * (always at least the floor) narrows it again inside the run.
 */
async function candidateHouseholds(admin: SupabaseClient, now: Date): Promise<string[]> {
  const ids = new Set<string>();
  for (const spec of CLEANUP_SPECS) {
    const { data } = await admin
      .from(spec.table)
      .select("household_id")
      .is("soft_deleted_at", null)
      .lt(spec.ageColumn, cutoff(now, MIN_RETENTION_WINDOW_DAYS, spec.dateOnly ?? false))
      .limit(5000);
    for (const row of (data as { household_id: string }[] | null) ?? []) ids.add(row.household_id);
    if (ids.size >= MAX_HOUSEHOLDS * 4) break;
  }
  return [...ids].slice(0, MAX_HOUSEHOLDS);
}

/**
 * Soft-deletes everything past its household's window, writing a counts-only
 * audit row per (household, category) that touched something.
 */
export async function runRetentionCleanup(admin: SupabaseClient, now: Date = new Date()): Promise<CleanupSummary> {
  const { windows, ok } = await loadRetentionWindows(admin);
  if (!ok) {
    log.warn("retention cleanup skipped: windows unreadable");
    return { ...NOTHING, skipped: "windows_unreadable" };
  }

  const households = await candidateHouseholds(admin, now);
  const totals = new Map<string, CleanupOutcome>(CLEANUP_SPECS.map((spec) => [spec.category, { category: spec.category, marked: 0 }]));
  let touched = 0;

  for (const householdId of households) {
    const windowDays = windows.has(householdId) ? windows.get(householdId)! : DEFAULT_RETENTION_WINDOW_DAYS;
    // `null` means the household turned cleanup off — keep everything.
    if (windowDays === null) continue;
    const effective = Math.max(windowDays, MIN_RETENTION_WINDOW_DAYS);
    let householdTouched = false;

    for (const spec of CLEANUP_SPECS) {
      const outcome = totals.get(spec.category)!;
      try {
        const marked = await markOne(admin, spec, householdId, cutoff(now, effective, spec.dateOnly ?? false), now);
        if (marked > 0) {
          outcome.marked += marked;
          householdTouched = true;
          await recordRun(admin, householdId, spec.category, marked, windowDays, now);
        }
      } catch (thrown) {
        outcome.error = thrown instanceof Error ? thrown.name : "unknown";
      }
    }
    if (householdTouched) touched += 1;
  }

  const outcomes = [...totals.values()];
  const marked = outcomes.reduce((sum, outcome) => sum + outcome.marked, 0);
  log.info("retention cleanup", {
    households: touched,
    marked,
    outcomes: outcomes.map((outcome) => ({ category: outcome.category, marked: outcome.marked, error: outcome.error })),
    allow: ["households", "marked", "outcomes"],
  });
  return { households: touched, marked, outcomes };
}

/** One (household, spec) soft-delete, read-then-mark so the batch is bounded. */
async function markOne(admin: SupabaseClient, spec: CleanupSpec, householdId: string, before: string, now: Date): Promise<number> {
  const { data: candidates, error: readError } = await admin
    .from(spec.table)
    .select("id")
    .eq("household_id", householdId)
    .is("soft_deleted_at", null)
    .lt(spec.ageColumn, before)
    .limit(BATCH);
  if (readError) throw new Error(readError.code ?? "read_failed");
  const ids = ((candidates as { id: string }[] | null) ?? []).map((row) => row.id);
  if (ids.length === 0) return 0;

  const { data: marked, error: writeError } = await admin
    .from(spec.table)
    .update({ soft_deleted_at: now.toISOString() })
    .in("id", ids)
    .is("soft_deleted_at", null)
    .select("id");
  if (writeError) throw new Error(writeError.code ?? "write_failed");
  return ((marked as { id: string }[] | null) ?? []).length;
}

/** The counts-only audit row (guardrail G6): never an id, title or body. */
async function recordRun(admin: SupabaseClient, householdId: string, category: string, affected: number, windowDays: number, now: Date): Promise<void> {
  const { error } = await admin.from("retention_cleanup_runs").insert({
    household_id: householdId,
    category,
    phase: "soft_delete",
    affected,
    window_days: windowDays,
    ran_at: now.toISOString(),
  });
  if (error) log.warn("retention cleanup audit write failed", { reason: error.code ?? "unknown", allow: ["reason"] });
}

/**
 * The irreversible purge, GATED OFF (guardrail G7). It is written so the
 * lifecycle is complete and testable, but it no-ops unless `enabled` is passed
 * true, and nothing in phase 1 passes it. Enabling it is a separate decision
 * (design Q4): it hard-deletes rows soft-deleted longer ago than the grace
 * window. Because soft-delete left every foreign key in place, the existing
 * `on delete cascade` / `set null` definitions keep the delete from orphaning.
 */
export async function purgeSoftDeleted(
  admin: SupabaseClient,
  now: Date = new Date(),
  options: { enabled?: boolean; graceDays?: number } = {},
): Promise<CleanupOutcome[]> {
  if (!(options.enabled ?? RETENTION_PURGE_ENABLED)) return [];
  const graceDays = options.graceDays ?? DEFAULT_RETENTION_WINDOW_DAYS;
  const before = new Date(now.getTime() - graceDays * MS_PER_DAY).toISOString();
  const outcomes: CleanupOutcome[] = [];
  for (const spec of CLEANUP_SPECS) {
    const { data, error } = await admin.from(spec.table).delete().lt("soft_deleted_at", before).not("soft_deleted_at", "is", null).select("id");
    if (error) {
      outcomes.push({ category: spec.category, marked: 0, error: error.code ?? "unknown" });
      continue;
    }
    outcomes.push({ category: spec.category, marked: ((data as { id: string }[] | null) ?? []).length });
  }
  return outcomes;
}
