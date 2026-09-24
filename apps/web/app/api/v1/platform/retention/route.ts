import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { runHealthReminderSweep } from "@wonderhome/core/health/reminders";
import { runMeasurementRoutineSweep } from "@wonderhome/core/health/routine-reminders";
import { drainJobs, type DrainOutcome } from "@wonderhome/core/homesend/retry-queue";
import { reconcileAllHouseholds, type SweepSummary } from "@wonderhome/core/notifications/reconcile";
import { pruneExpiredShareHandoffs } from "@wonderhome/core/homesend/share-handoff";
import { log } from "@wonderhome/core/observability/logger";
import { fulfillMaturedDeletions } from "@wonderhome/core/privacy/fulfill-deletion";
import { purgeExpired, summarise } from "@wonderhome/core/privacy/purge";

/**
 * Applies the retention schedule (story 15-007).
 *
 * The Privacy Centre publishes how long each kind of thing is kept. This is
 * what makes that true — a published policy nothing applies is a promise, and
 * this endpoint is the difference.
 *
 * Authorised by a shared secret rather than a session, because there is no
 * person here: Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`.
 * It is deliberately not reachable from any household's own session — purging
 * crosses every household at once, which is the last thing a tenant should be
 * able to trigger.
 *
 * With no `CRON_SECRET` configured it refuses everything rather than running
 * open. A retention sweep anybody can invoke is a button that deletes a
 * household's history on demand.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  // 401 rather than 403: the credential is the Authorization header itself, so
  // a missing or wrong one is a failure to authenticate, not a permission this
  // caller lacks. It is also the answer every other endpoint here gives an
  // anonymous caller, and one endpoint answering differently is a way to tell
  // this one apart from the rest.
  const refuse = () =>
    Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "retention" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );

  // Never says which part was wrong, and never says whether a secret is set
  // at all: both answers are information somebody probing would want.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return refuse();

  try {
    const admin = createAdminClient();
    const outcomes = await purgeExpired(admin);

    // Not a `RetentionClass`: staged, pre-account share content has its own
    // fixed 30-minute window rather than the day-scale schedule the Privacy
    // Centre publishes (see `pruneExpiredShareHandoffs`'s own doc comment),
    // so it is swept here directly rather than forced into that schedule.
    let handoffsDeleted = 0;
    let handoffsError: string | undefined;
    try {
      handoffsDeleted = await pruneExpiredShareHandoffs(admin);
    } catch (thrown) {
      handoffsError = thrown instanceof Error ? thrown.message : "unknown";
    }
    // Also not a `RetentionClass`: a matured deletion request acts on its own
    // `acts_at`, not on an age cutoff `purgeExpired`'s table-scan pattern
    // fits — `fulfill-deletion.ts`'s own doc comment says why.
    let deletionsFulfilled = 0;
    let deletionsFailed = 0;
    try {
      const deletionOutcomes = await fulfillMaturedDeletions(admin);
      deletionsFulfilled = deletionOutcomes.filter((outcome) => outcome.fulfilled).length;
      deletionsFailed = deletionOutcomes.filter((outcome) => !outcome.fulfilled).length;
    } catch (thrown) {
      deletionsFailed = -1; // The lookup itself failed, not one request within it.
      log.error("deletion fulfillment sweep failed", {
        reason: thrown instanceof Error ? thrown.message : "unknown",
        allow: ["reason"],
      });
    }

    // Not a retention sweep at all — folded into this route rather than
    // given its own cron entry because the project's Hobby-tier plan caps
    // how many cron jobs a deployment gets (the same reason
    // `/platform/webhook-delivery` runs daily rather than more often).
    // Appointment reminders are day-granularity concepts anyway (advance/
    // preparation/day-of), so this cadence is the right one for them, not a
    // compromise made to fit.
    let reminderSummary: { checked: number; sent: number; skipped: number } | null = null;
    let reminderError: string | undefined;
    try {
      reminderSummary = await runHealthReminderSweep(admin);
    } catch (thrown) {
      reminderError = thrown instanceof Error ? thrown.message : "unknown";
      log.error("health reminder sweep failed", { reason: reminderError, allow: ["reason"] });
    }

    // Same reasoning as the appointment reminder sweep above: a measurement
    // routine's reminder is a day-scale concept ("today's the day"), so this
    // cadence is the right one, not a compromise, and folding it into this
    // route rather than a route of its own is the same Hobby-tier cron-count
    // constraint.
    let routineReminderSummary: { checked: number; sent: number; skipped: number } | null = null;
    let routineReminderError: string | undefined;
    try {
      routineReminderSummary = await runMeasurementRoutineSweep(admin);
    } catch (thrown) {
      routineReminderError = thrown instanceof Error ? thrown.message : "unknown";
      log.error("measurement routine reminder sweep failed", { reason: routineReminderError, allow: ["reason"] });
    }

    // Smart reminders (module 23) are reconciled whenever someone opens the
    // app; this pass keeps them moving for households nobody opened today.
    let smartReminderSummary: SweepSummary | null = null;
    let smartReminderError: string | undefined;
    try {
      smartReminderSummary = await reconcileAllHouseholds(admin);
    } catch (thrown) {
      smartReminderError = thrown instanceof Error ? thrown.message : "unknown";
      log.error("smart reminder reconcile failed", { reason: smartReminderError, allow: ["reason"] });
    }

    // Wave 5 §15/§16: queued retries (a HomeSend item a provider could not
    // read when it arrived) are worked here too, so none waits more than a
    // day even when nothing else wakes the queue. Then rate-limit windows
    // and email telemetry past their usefulness are cleared.
    let jobsSummary: DrainOutcome | null = null;
    let jobsError: string | undefined;
    try {
      jobsSummary = await drainJobs(admin, { limit: 25, workerId: "retention" });
    } catch (thrown) {
      jobsError = thrown instanceof Error ? thrown.message : "unknown";
      log.error("job queue drain failed", { reason: jobsError, allow: ["reason"] });
    }
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const counters = await admin.from("rate_limit_counters").delete({ count: "exact" }).lt("window_start", dayAgo);
    const emailEvents = await admin.from("homesend_email_events").delete({ count: "exact" }).lt("created_at", ninetyDaysAgo);
    const channelEvents = await admin.from("hometalk_channel_events").delete({ count: "exact" }).lt("created_at", ninetyDaysAgo);

    const swept = [
      ...outcomes.map(({ table, deleted, error }) => ({ table, deleted, error })),
      { table: "homesend_share_handoffs", deleted: handoffsDeleted, error: handoffsError },
      { table: "rate_limit_counters", deleted: counters.count ?? 0, error: counters.error?.code },
      { table: "homesend_email_events", deleted: emailEvents.count ?? 0, error: emailEvents.error?.code },
      { table: "hometalk_channel_events", deleted: channelEvents.count ?? 0, error: channelEvents.error?.code },
    ];
    const failed = swept.filter((row) => row.error);

    log.info("retention sweep", {
      summary: summarise(outcomes),
      handoffsDeleted,
      deletionsFulfilled,
      deletionsFailed,
      reminderSummary,
      routineReminderSummary,
      smartReminderSummary,
      jobsSummary,
      failed: failed.length,
      allow: ["summary", "handoffsDeleted", "deletionsFulfilled", "deletionsFailed", "reminderSummary", "routineReminderSummary", "smartReminderSummary", "jobsSummary", "failed"],
    });

    // Counts only. What was deleted is exactly what must not be reported back.
    return Response.json(
      {
        swept,
        deletionsFulfilled,
        deletionsFailed,
        healthReminders: reminderSummary ?? { error: reminderError },
        routineReminders: routineReminderSummary ?? { error: routineReminderError },
        smartReminders: smartReminderSummary ?? { error: smartReminderError },
        jobs: jobsSummary ?? { error: jobsError },
      },
      {
        status: failed.length > 0 || deletionsFailed !== 0 || reminderError || routineReminderError || smartReminderError || jobsError ? 207 : 200,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (thrown) {
    const { status, body } = toErrorBody(thrown, "retention");
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  }
}

/**
 * Vercel Cron calls a path with GET, never POST. With only a POST handler
 * the scheduled run answered 405 every day and nothing ran. The same
 * handler, behind the same secret, answers both. POST stays for manual and
 * scripted runs.
 */
export const GET = POST;

export const dynamic = "force-dynamic";
