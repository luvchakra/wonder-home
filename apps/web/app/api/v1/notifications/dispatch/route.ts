import { after } from "next/server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { keepStoresWarm } from "@wonderhome/core/homebrain/context-store";
import { CLOCK_DRAIN_LIMIT, drainKnowledge } from "@wonderhome/core/knowledge/facts";
import { sleepDueHouseholds } from "@wonderhome/core/homebrain/sleep/run";
import { archiveStaleHomeSendItems } from "@wonderhome/core/homesend/repository";
import { drainJobs } from "@wonderhome/core/homesend/retry-queue";
import { runHomeSendTidy } from "@wonderhome/core/homesend/tidy-run";
import { runNeedsYouDeadlines } from "@wonderhome/core/hometalk/needs-you-run";
import { notificationJobHandlers } from "@wonderhome/core/notifications/retry-handler";
import { githubHeartbeats } from "@wonderhome/core/jobs/heartbeat";
import { runDeliveryFallback } from "@wonderhome/core/jobs/delivery";
import { runTriviaRefill } from "@wonderhome/core/school/trivia-refill";
import { JOBS } from "@wonderhome/core/jobs/runner";
import { queueModelReads } from "@wonderhome/core/homesend/model-unavailable";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { WHATSAPP_PROCESS_KIND, whatsappJobHandler } from "@wonderhome/core/whatsapp/intake";
import { log } from "@wonderhome/core/observability/logger";

import { homesendAfterModelRead } from "@/app/_lib/homesend-after-model-read";
import { trustedEmailAutoAdd } from "@/app/_lib/homesend-trusted-email";
import { whatsappAsk, whatsappAutoAdd, whatsappDecider } from "@/app/_lib/whatsapp-hometalk";

/**
 * The delivery clock (story 23-015): every five minutes the database calls
 * this (pg_cron, migration `20261018280000`), and whatever has come due since
 * goes out — in the app, and as a push to the devices of the one person it is
 * for, while it is still fresh. A reminder set for 7:30 lands at 7:30, not at
 * whatever moment somebody next opens the app.
 *
 * The same tick moves each household with an open reminder to its next
 * stage (`advanceDueStages`: "tonight" → "this morning"), so a stage lands
 * at its time and not when someone next opens the app.
 *
 * Authorised like every platform job, by `Authorization: Bearer $CRON_SECRET`,
 * refusing everything when no secret is set. Only households with something
 * actually due are touched, at most 200 a run; the rest wait five minutes.
 * Vercel Cron sends GET, the database sends POST; both are accepted. The
 * same tick keeps a few of HomeBrain's stored contexts warm (`keepStoresWarm`)
 * and is HomeBrain's body clock: after the response, a household whose
 * night it is (2–5 am on its own clock) and which has not slept today sleeps
 * (`sleepDueHouseholds`, HomeBrain Sleep), a couple per tick.
 *
 * Since 2026-11-23 this route is the fallback ("can we move these jobs to
 * GitHub instead"). pg_cron also dispatches `delivery-clock.yml` on GitHub
 * every five minutes (`wh.trigger_delivery_clock`), which runs every delivery
 * step (`jobs/delivery.ts`) and the batch steps (`background-jobs.yml`'s
 * clock), each writing a heartbeat. This tick reads the heartbeats once and
 * runs only the steps whose heartbeat is stale (15 minutes for delivery, 30
 * for the clock steps). While GitHub is healthy that is none: one read, one
 * look at the retry queue, and it answers. Running on both at once sends
 * nothing twice (each step's claim, `jobs/delivery.ts`).
 *
 * The retry queue stays here: its WhatsApp replies need the app's HomeTalk.
 */
/** Sleep and tidy may run after the response when GitHub's clock is stale; they can take a while for a large household. */
export const maxDuration = 300;

/** True when the retry queue holds a job that is due, or one whose lease ran out: one indexed read. */
async function retryQueueHasWork(admin: ReturnType<typeof createAdminClient>, now: Date): Promise<boolean> {
  try {
    const iso = now.toISOString();
    const { data, error } = await admin
      .from("jobs")
      .select("id")
      .or(`and(status.eq.pending,run_after.lte.${iso}),and(status.eq.claimed,claimed_until.lt.${iso})`)
      .limit(1);
    // Unreadable: drain anyway, as before.
    return error ? true : (data ?? []).length > 0;
  } catch {
    return true;
  }
}

async function dispatch(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "dispatch" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const now = new Date();
  const admin = createAdminClient();
  // One read of the heartbeats and one look at the retry queue, together; a failed read answers "none fresh".
  const [heartbeats, queued] = await Promise.all([githubHeartbeats(admin, [...JOBS.delivery, ...JOBS.clock], now), retryQueueHasWork(admin, now)]);
  const onGitHub = heartbeats.fresh;
  const allOnGitHub = [...JOBS.delivery, ...JOBS.clock].every((step) => onGitHub.has(step));
  if (queued) after(() => drainRetryQueue(admin));
  if (allOnGitHub) {
    return Response.json({ ok: true, onGitHub: onGitHub.size, queued }, { headers: { "cache-control": "no-store" } });
  }
  // GitHub has gone quiet on some step: this tick does those itself, in the order the clock always has.
  const delivery = await runDeliveryFallback(admin, now, heartbeats);
  // The same clock keeps HomeBrain's stored household contexts whole (14-031):
  // a few that are behind or over an hour old are rebuilt per tick.
  let warmed = 0;
  try {
    if (!onGitHub.has("clock.context-warm")) warmed = await keepStoresWarm(admin, now);
  } catch (thrown) {
    log.warn("context keep-warm failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  // And writes the record index's facts for records whose own drain did not run (14-037): a write outside a request, a failed try.
  let facts = 0;
  try {
    if (!onGitHub.has("clock.knowledge")) facts = (await drainKnowledge(admin, { limit: CLOCK_DRAIN_LIMIT, now })).written;
  } catch (thrown) {
    log.warn("knowledge drain failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  after(async () => {
    // HomeSend's 30-day archive (the owner, 2026-11-03): untouched waiting or failed items are set
    // aside — kept, restorable — on each household's own calendar. Bounded and idempotent; the next
    // notice sweep then drops them from the grouped reminder.
    try {
      if (!onGitHub.has("clock.homesend-archive")) await archiveStaleHomeSendItems(admin, { now, limit: 200 });
    } catch (thrown) {
      log.warn("homesend archive tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
    // HomeSend's daily tidy (the owner, 2026-11-03): once a day per household, from 04:00 on its own
    // clock, waiting items that no longer apply are archived with a reason — rules first, a checked AI
    // verdict only where the rules can't tell. A few households a tick; claimed per day, so idempotent.
    try {
      if (!onGitHub.has("clock.homesend-tidy")) await runHomeSendTidy(admin, { now, limit: 5 });
    } catch (thrown) {
      log.warn("homesend tidy tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
    // "Nothing waits" (2026-11-14): due "Needs you" defaults applied after 24 hours, nothing open past 48,
    // every waiting HomeSend item ended as something. Bounded and idempotent; only while GitHub's clock is stale.
    try {
      if (!onGitHub.has("clock.homesend-deadlines")) {
        await runNeedsYouDeadlines(admin, { now, limit: 10 });
        await queueModelReads(admin, { now, limit: 25 });
      }
    } catch (thrown) {
      log.warn("needs-you deadlines tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
    // Kids Trivia's low card pools (08-035): a couple a tick, only while GitHub's clock is stale.
    try {
      if (!onGitHub.has("clock.trivia-refill")) await runTriviaRefill(admin, { now, limit: 2 });
    } catch (thrown) {
      log.warn("trivia refill tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
    try {
      if (!onGitHub.has("clock.homebrain-sleep")) await sleepDueHouseholds(admin, now);
    } catch (thrown) {
      log.warn("homebrain sleep tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
  });
  return Response.json({ ok: true, onGitHub: onGitHub.size, queued, ran: delivery.ran.length, ...delivery.summary["delivery.due"], warmed, facts }, { headers: { "cache-control": "no-store" } });
}

/** Deliveries that failed for a reason worth another try (story 27-010), worked by the same clock, after the response. */
async function drainRetryQueue(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  try {
    const whatsapp = whatsappConfigFromEnv();
    await drainJobs(admin, {
      limit: 10,
      workerId: "dispatch",
      handlers: { ...notificationJobHandlers(), ...(whatsapp ? { [WHATSAPP_PROCESS_KIND]: whatsappJobHandler({ config: whatsapp.adapter, ask: whatsappAsk(createAdminClient()), addOnItsOwn: whatsappAutoAdd(createAdminClient()), decider: whatsappDecider() }) } : {}) },
      // An email read on the queue (held until "Trust this sender?") is added on its own when its sender is trusted.
      addTrusted: trustedEmailAutoAdd(admin),
      // Something kept until a model could read it: added and told once it is read (2026-11-21).
      afterModelRead: homesendAfterModelRead(admin),
    });
  } catch (thrown) {
    log.warn("notification retry drain failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
}

export const POST = dispatch;
export const GET = dispatch;
