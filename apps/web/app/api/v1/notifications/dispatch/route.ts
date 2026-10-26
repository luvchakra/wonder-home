import { after } from "next/server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { runHealthReminderSweep } from "@wonderhome/core/health/reminders";
import { runMeasurementRoutineSweep } from "@wonderhome/core/health/routine-reminders";
import { keepStoresWarm } from "@wonderhome/core/homebrain/context-store";
import { sleepDueHouseholds } from "@wonderhome/core/homebrain/sleep/run";
import { drainJobs } from "@wonderhome/core/homesend/retry-queue";
import { notificationJobHandlers } from "@wonderhome/core/notifications/retry-handler";
import { sendDueDigests } from "@wonderhome/core/notifications/digest";
import { householdsWithNoticeChanges, sweepNotices } from "@wonderhome/core/notifications/notices-sweep";
import { tellPlatformAdmins } from "@wonderhome/core/ai/platform-key-alert";
import { platformMailer } from "@wonderhome/core/email/mailer";
import { advanceDueStages, deliverDueNotifications } from "@wonderhome/core/notifications/reconcile";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { WHATSAPP_PROCESS_KIND, whatsappJobHandler } from "@wonderhome/core/whatsapp/intake";
import { log } from "@wonderhome/core/observability/logger";

import { whatsappAsk, whatsappAutoAdd } from "@/app/_lib/whatsapp-hometalk";

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
 */
const MAX_HOUSEHOLDS = 200;
/** A night's sleep runs after the response; it may take a while for a large household. */
export const maxDuration = 300;

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
  // Reminders whose next stage is due ("tonight" → "this morning") move on now,
  // not when someone next opens the app; what they make due is delivered below.
  let advanced = 0;
  try {
    advanced = (await advanceDueStages(admin, now)).households;
  } catch (thrown) {
    log.warn("reminder stage pass failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  // Health reminders on the household's own clock (an appointment's day-of from 7:00 or two hours
  // before; a measurement from 9:00), each sent once; the daily sweep only catches what this missed.
  let health = 0;
  try {
    const [appointments, routines] = await Promise.all([runHealthReminderSweep(admin, now), runMeasurementRoutineSweep(admin, now)]);
    health = appointments.sent + routines.sent;
  } catch (thrown) {
    log.warn("health reminder pass failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  const { data, error } = await admin
    .from("notifications")
    .select("household_id")
    .eq("status", "generated")
    .lte("scheduled_for", now.toISOString())
    .limit(2000);
  if (error) {
    log.warn("dispatch read failed", { code: error.code ?? "unknown" });
    return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
  }
  const households = [...new Set(((data ?? []) as { household_id: string }[]).map((row) => row.household_id))].slice(0, MAX_HOUSEHOLDS);
  let delivered = 0;
  for (const householdId of households) {
    try {
      delivered += await deliverDueNotifications(admin, householdId, now);
    } catch (thrown) {
      log.warn("dispatch failed for a household", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
  }
  // Notices (module 27): a household whose records a notice reads from changed since the last
  // tick is swept now, so the notice lands within minutes whether or not anyone has the app open.
  let noticed = 0;
  try {
    const changed = await householdsWithNoticeChanges(admin, new Date(now.getTime() - 6 * 60_000), 50);
    for (const householdId of changed) {
      const swept = await sweepNotices(admin, householdId, now);
      noticed += swept.created + swept.updated + swept.resolved;
    }
  } catch (thrown) {
    log.warn("notice sweep tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  // An alert on WonderHome's own AI key goes to the platform admins, once (14-048).
  await tellPlatformAdmins(admin, platformMailer(), now);
  // Morning digests (story 27-008): each one whose time has come on its household's clock.
  let digests = 0;
  try {
    digests = await sendDueDigests(admin, now);
  } catch (thrown) {
    log.warn("digest tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  // The same clock keeps HomeBrain's stored household contexts whole (14-031):
  // a few that are behind or over an hour old are rebuilt per tick.
  let warmed = 0;
  try {
    warmed = await keepStoresWarm(admin, now);
  } catch (thrown) {
    log.warn("context keep-warm failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  after(async () => {
    // Deliveries that failed for a reason worth another try (story 27-010), worked by the same clock.
    try {
      const whatsapp = whatsappConfigFromEnv();
      await drainJobs(admin, {
        limit: 10,
        workerId: "dispatch",
        handlers: { ...notificationJobHandlers(), ...(whatsapp ? { [WHATSAPP_PROCESS_KIND]: whatsappJobHandler({ config: whatsapp.adapter, ask: whatsappAsk(createAdminClient()), addOnItsOwn: whatsappAutoAdd(createAdminClient()) }) } : {}) },
      });
    } catch (thrown) {
      log.warn("notification retry drain failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
    try {
      await sleepDueHouseholds(admin, now);
    } catch (thrown) {
      log.warn("homebrain sleep tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
  });
  return Response.json({ ok: true, households: households.length, delivered, advanced, health, noticed, digests, warmed }, { headers: { "cache-control": "no-store" } });
}

export const POST = dispatch;
export const GET = dispatch;
