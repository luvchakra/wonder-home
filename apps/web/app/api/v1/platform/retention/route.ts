import { toErrorBody } from "@wonderhome/core/api/errors";
import { reconcileAllProviders, type ReconciliationSummary } from "@wonderhome/core/billing/reconcile";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { runHealthReminderSweep } from "@wonderhome/core/health/reminders";
import { runMeasurementRoutineSweep } from "@wonderhome/core/health/routine-reminders";
import { drainJobs, type DrainOutcome } from "@wonderhome/core/homesend/retry-queue";
import { runRetentionSweeps } from "@wonderhome/core/jobs/daily";
import { ranOnGitHub } from "@wonderhome/core/jobs/heartbeat";
import { reconcileAllHouseholds, type SweepSummary } from "@wonderhome/core/notifications/reconcile";
import { notificationJobHandlers } from "@wonderhome/core/notifications/retry-handler";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { WHATSAPP_PROCESS_KIND, whatsappJobHandler } from "@wonderhome/core/whatsapp/intake";
import { log } from "@wonderhome/core/observability/logger";

import { trustedEmailAutoAdd } from "@/app/_lib/homesend-trusted-email";
import { whatsappAsk, whatsappAutoAdd } from "@/app/_lib/whatsapp-hometalk";

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
    const now = new Date();
    // The sweeps that send nothing (purge, handoffs, deletions, cleanup, the
    // purge dry-run, old events, catalog staples) run on GitHub Actions too
    // (`background-jobs.yml`, 2026-11-07); while its `daily.retention`
    // heartbeat is fresh they are skipped here, and done here once it is not.
    const onGitHub = (await ranOnGitHub(admin, ["daily.retention"], now)).has("daily.retention");
    const retention = onGitHub ? null : await runRetentionSweeps(admin, now);

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
      // WhatsApp messages still waiting (a media download or a model that
      // was down when they arrived) are worked by the same pass.
      const whatsapp = whatsappConfigFromEnv();
      jobsSummary = await drainJobs(admin, {
        limit: 25,
        workerId: "retention",
        handlers: { ...notificationJobHandlers(), ...(whatsapp ? { [WHATSAPP_PROCESS_KIND]: whatsappJobHandler({ config: whatsapp.adapter, ask: whatsappAsk(createAdminClient()), addOnItsOwn: whatsappAutoAdd(createAdminClient()) }) } : {}) },
        // An email read on the queue (held until "Trust this sender?") is added on its own when its sender is trusted.
        addTrusted: trustedEmailAutoAdd(admin),
      });
    } catch (thrown) {
      jobsError = thrown instanceof Error ? thrown.message : "unknown";
      log.error("job queue drain failed", { reason: jobsError, allow: ["reason"] });
    }
    log.info("retention sweep", {
      onGitHub,
      reminderSummary,
      routineReminderSummary,
      smartReminderSummary,
      jobsSummary,
      allow: ["onGitHub", "reminderSummary", "routineReminderSummary", "smartReminderSummary", "jobsSummary"],
    });

    // Counts only. What was deleted is exactly what must not be reported back.
    // Payments reconciliation (story 20-011): nightly, like the rest, and a
    // no-op for any provider that is not configured.
    let reconciliation: ReconciliationSummary[] | null = null;
    let reconciliationError: string | undefined;
    try {
      reconciliation = await reconcileAllProviders(admin);
    } catch (thrown) {
      reconciliationError = thrown instanceof Error ? thrown.message : "unknown";
      log.error("payments reconciliation failed", { reason: reconciliationError, allow: ["reason"] });
    }

    return Response.json(
      {
        onGitHub,
        swept: retention?.swept ?? [],
        catalog: retention?.catalog ?? null,
        deletionsFulfilled: retention?.deletionsFulfilled ?? 0,
        deletionsFailed: retention?.deletionsFailed ?? 0,
        healthReminders: reminderSummary ?? { error: reminderError },
        routineReminders: routineReminderSummary ?? { error: routineReminderError },
        smartReminders: smartReminderSummary ?? { error: smartReminderError },
        jobs: jobsSummary ?? { error: jobsError },
        cleanup: retention?.cleanup ?? null,
        purgeDryRun: retention?.purgeDryRun ?? null,
        reconciliation: reconciliation ?? { error: reconciliationError },
      },
      {
        status: retention?.partial || reminderError || routineReminderError || smartReminderError || jobsError || reconciliationError ? 207 : 200,
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
