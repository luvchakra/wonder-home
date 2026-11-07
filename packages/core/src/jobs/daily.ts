import type { SupabaseClient } from "@supabase/supabase-js";

import { importOpenFoodFacts, todaysQueries, type ImportReport } from "../commerce/catalog-import";
import { pruneExpiredShareHandoffs } from "../homesend/share-handoff";
import { log } from "../observability/logger";
import { purgeSoftDeleted, runRetentionCleanup, type CleanupSummary } from "../privacy/cleanup";
import { fulfillMaturedDeletions } from "../privacy/fulfill-deletion";
import { purgeExpired, summarise } from "../privacy/purge";

/**
 * The nightly retention sweeps that send nothing to anyone (story 15-007 and
 * the sweeps folded in beside it): the published retention schedule, staged
 * share handoffs, matured deletion requests, the household's own cleanup
 * window, the soft-delete purge (dry-run only, the owner's Q4), old event
 * rows, and a few grocery catalog staples from Open Food Facts.
 *
 * Moved out of `/api/v1/platform/retention` (2026-11-07) so the GitHub runner
 * can do it with nothing but the database; the route still does it whenever
 * the runner has not (`daily.retention` heartbeat). The parts of that route
 * that send notifications or need the app (health reminders, the reminder
 * reconcile, the retry queue, payments) stay on Vercel.
 *
 * Every step is idempotent: a second run on the same day deletes what is
 * newly past its window, nothing twice. Counts only come back.
 */
export type RetentionSweepResult = {
  swept: { table: string; deleted: number; error?: string }[];
  deletionsFulfilled: number;
  /** -1 when the lookup itself failed. */
  deletionsFailed: number;
  cleanup: CleanupSummary | { error: string };
  purgeDryRun: { dryRun: boolean; wouldDelete: number } | { error: string };
  catalog: ImportReport | null;
  /** True when any part failed (the route answers 207, the runner exits non-zero). */
  partial: boolean;
};

export type RetentionDeps = { fetch?: typeof fetch };

export async function runRetentionSweeps(admin: SupabaseClient, now: Date = new Date(), deps: RetentionDeps = {}): Promise<RetentionSweepResult> {
  const outcomes = await purgeExpired(admin, now);

  // Staged, pre-account share content has its own fixed 30-minute window
  // (`pruneExpiredShareHandoffs`), not the day-scale published schedule.
  let handoffsDeleted = 0;
  let handoffsError: string | undefined;
  try {
    handoffsDeleted = await pruneExpiredShareHandoffs(admin);
  } catch (thrown) {
    handoffsError = thrown instanceof Error ? thrown.message : "unknown";
  }

  // A matured deletion request acts on its own `acts_at`, not an age cutoff.
  let deletionsFulfilled = 0;
  let deletionsFailed = 0;
  try {
    const deletionOutcomes = await fulfillMaturedDeletions(admin, now);
    deletionsFulfilled = deletionOutcomes.filter((outcome) => outcome.fulfilled).length;
    deletionsFailed = deletionOutcomes.filter((outcome) => !outcome.fulfilled).length;
  } catch (thrown) {
    deletionsFailed = -1;
    log.error("deletion fulfillment sweep failed", { reason: thrown instanceof Error ? thrown.message : "unknown", allow: ["reason"] });
  }

  // The household's own retention window on records a person created, soft-delete only (`docs/data-retention.md`).
  let cleanup: RetentionSweepResult["cleanup"];
  try {
    cleanup = await runRetentionCleanup(admin, now);
  } catch (thrown) {
    cleanup = { error: thrown instanceof Error ? thrown.message : "unknown" };
    log.error("retention cleanup failed", { reason: cleanup.error, allow: ["reason"] });
  }

  // Dry-run only: reports what is past the grace window and deletes nothing.
  let purgeDryRun: RetentionSweepResult["purgeDryRun"];
  try {
    const { outcomes: marked } = await purgeSoftDeleted(admin, now, { dryRun: true });
    purgeDryRun = { dryRun: true, wouldDelete: marked.reduce((sum, o) => sum + o.marked, 0) };
  } catch (thrown) {
    purgeDryRun = { error: thrown instanceof Error ? thrown.message : "unknown" };
    log.error("retention purge dry-run failed", { reason: purgeDryRun.error, allow: ["reason"] });
  }

  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const counters = await admin.from("rate_limit_counters").delete({ count: "exact" }).lt("window_start", dayAgo);
  const emailEvents = await admin.from("homesend_email_events").delete({ count: "exact" }).lt("created_at", ninetyDaysAgo);
  const channelEvents = await admin.from("hometalk_channel_events").delete({ count: "exact" }).lt("created_at", ninetyDaysAgo);
  const whatsappEvents = await admin.from("whatsapp_events").delete({ count: "exact" }).lt("created_at", ninetyDaysAgo);
  // A connect code is useful for fifteen minutes; a day later it is only a hash to keep.
  const linkRequests = await admin.from("whatsapp_link_requests").delete({ count: "exact" }).lt("expires_at", dayAgo);

  const swept = [
    ...outcomes.map(({ table, deleted, error }) => ({ table, deleted, error })),
    { table: "homesend_share_handoffs", deleted: handoffsDeleted, error: handoffsError },
    { table: "rate_limit_counters", deleted: counters.count ?? 0, error: counters.error?.code },
    { table: "homesend_email_events", deleted: emailEvents.count ?? 0, error: emailEvents.error?.code },
    { table: "hometalk_channel_events", deleted: channelEvents.count ?? 0, error: channelEvents.error?.code },
    { table: "whatsapp_events", deleted: whatsappEvents.count ?? 0, error: whatsappEvents.error?.code },
    { table: "whatsapp_link_requests", deleted: linkRequests.count ?? 0, error: linkRequests.error?.code },
  ];
  const failed = swept.filter((row) => row.error);

  // The shared grocery catalog (HomeFood 25-006): a few staples a night, so it stays current without one long run.
  let catalog: ImportReport | null = null;
  try {
    catalog = await importOpenFoodFacts(admin, deps.fetch ?? fetch, todaysQueries(now));
  } catch (thrown) {
    log.warn("grocery catalog refresh failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }

  log.info("retention sweep", {
    summary: summarise(outcomes),
    handoffsDeleted,
    deletionsFulfilled,
    deletionsFailed,
    cleanupSummary: cleanup,
    purgeDryRun,
    failed: failed.length,
    allow: ["summary", "handoffsDeleted", "deletionsFulfilled", "deletionsFailed", "cleanupSummary", "purgeDryRun", "failed"],
  });

  return {
    swept,
    deletionsFulfilled,
    deletionsFailed,
    cleanup,
    purgeDryRun,
    catalog,
    partial: failed.length > 0 || deletionsFailed !== 0 || "error" in cleanup || "error" in purgeDryRun,
  };
}
