import type { SupabaseClient } from "@supabase/supabase-js";

import { tellPlatformAdmins } from "../ai/platform-key-alert";
import { sweepStaleProposals } from "../conversation/proposal-expiry";
import { platformMailer } from "../email/mailer";
import { runHealthReminderSweep } from "../health/reminders";
import { runMeasurementRoutineSweep } from "../health/routine-reminders";
import { momentJudgeForHousehold } from "../homebrain/proposal-moment-model";
import { expireUnansweredSenders } from "../homesend/sender-trust";
import { sendDueDigests } from "../notifications/digest";
import { householdsWithNoticeChanges, sweepNotices } from "../notifications/notices-sweep";
import { advanceDueStages, deliverDueNotifications } from "../notifications/reconcile";
import { sweepMomentPassedProposals, sweepStaleNotifications } from "../notifications/stale";
import { log } from "../observability/logger";
import { runtimeEnvForAi } from "../platform/settings/runtime-env";
import type { JobStep, StepSummary } from "./heartbeat";

/**
 * The delivery tick's steps (story 23-015), in one place for both sides
 * (2026-11-23: "can we move these jobs to GitHub instead"):
 *
 *  - GitHub: `delivery-clock.yml`, dispatched every 5 minutes by pg_cron
 *    through the GitHub API (`wh.trigger_delivery_clock`), runs them through
 *    the runner (`runner.ts`, job `delivery`) and writes a heartbeat per step.
 *  - Vercel: `/api/v1/notifications/dispatch`, still called every 5 minutes by
 *    pg_cron, reads the heartbeats once and runs only the steps whose GitHub
 *    heartbeat has gone stale (15 minutes).
 *
 * Running on both at once never sends twice: a due reminder is claimed by the
 * one `generated → delivered` update that returns it (`deliverDueNotifications`),
 * a health reminder by its sent row, a digest by its day, a proposal reminder
 * and a stale clear by a compare-and-set on the status they read.
 */

/** At most this many households' due reminders per run; the rest wait one tick. */
export const MAX_DELIVERY_HOUSEHOLDS = 200;
/** Notices: households whose records changed since the last run, at most this many per run. */
const MAX_NOTICE_HOUSEHOLDS = 50;

export type DeliveryStep =
  | "delivery.stages"
  | "delivery.health"
  | "delivery.due"
  | "delivery.notices"
  | "delivery.proposals"
  | "delivery.stale"
  | "delivery.senders"
  | "delivery.key-alert"
  | "delivery.digests";

/** What a delivery step may know besides the clock: when it (or GitHub's run of it) last finished cleanly. */
export type DeliveryContext = { lastOkAt?: Date | null };

/**
 * How far back the notice sweep looks: a tick's own gap (6 minutes) normally,
 * back to the last clean run when that is longer (a late GitHub run, or Vercel
 * taking the step back) and under 30 minutes old.
 */
export function noticesSince(now: Date, lastOkAt: Date | null | undefined): Date {
  const tick = now.getTime() - 6 * 60_000;
  // Older than 30 minutes: the other side has been sweeping every 5 minutes since, so a tick's gap is enough.
  if (!lastOkAt || now.getTime() - lastOkAt.getTime() > 30 * 60_000) return new Date(tick);
  return new Date(Math.min(tick, lastOkAt.getTime() - 60_000));
}

type Run = (admin: SupabaseClient, now: Date, context: DeliveryContext) => Promise<StepSummary>;

export const DELIVERY_STEPS: Record<DeliveryStep, Run> = {
  "delivery.stages": async (admin, now) => ({ households: (await advanceDueStages(admin, now)).households }),
  "delivery.health": async (admin, now) => {
    const [appointments, routines] = await Promise.all([runHealthReminderSweep(admin, now), runMeasurementRoutineSweep(admin, now)]);
    return { sent: appointments.sent + routines.sent };
  },
  "delivery.due": async (admin, now) => {
    const { data, error } = await admin
      .from("notifications")
      .select("household_id")
      .eq("status", "generated")
      .lte("scheduled_for", now.toISOString())
      .limit(2000);
    if (error) throw new Error(`due read failed: ${error.code ?? "unknown"}`);
    const households = [...new Set(((data ?? []) as { household_id: string }[]).map((row) => row.household_id))].slice(0, MAX_DELIVERY_HOUSEHOLDS);
    let delivered = 0;
    let failed = 0;
    for (const householdId of households) {
      try {
        delivered += await deliverDueNotifications(admin, householdId, now);
      } catch (thrown) {
        failed += 1;
        log.warn("dispatch failed for a household", { reason: thrown instanceof Error ? thrown.name : "unknown" });
      }
    }
    return { households: households.length, delivered, failed };
  },
  "delivery.notices": async (admin, now, context) => {
    const changed = await householdsWithNoticeChanges(admin, noticesSince(now, context.lastOkAt), MAX_NOTICE_HOUSEHOLDS);
    let noticed = 0;
    for (const householdId of changed) {
      const swept = await sweepNotices(admin, householdId, now);
      noticed += swept.created + swept.updated + swept.resolved;
    }
    return { households: changed.length, noticed };
  },
  "delivery.proposals": async (admin, now) => {
    const stale = await sweepStaleProposals(admin, now);
    const passed = await sweepMomentPassedProposals(admin, now, { judgeFor: (householdId) => momentJudgeForHousehold(admin, householdId) });
    return { reminded: stale.reminded, expired: stale.expired + passed.expired, asked: passed.asked };
  },
  "delivery.stale": async (admin, now) => {
    const cleared = await sweepStaleNotifications(admin, now);
    return { cleared: Object.values(cleared).reduce<number>((sum, n) => sum + (n ?? 0), 0) };
  },
  "delivery.senders": async (admin, now) => ({ setAside: await expireUnansweredSenders(admin, now) }),
  // With the saved settings read first (2026-11-22): a cold read saw the platform key as unset and closed nothing.
  "delivery.key-alert": async (admin, now) => ({ told: await tellPlatformAdmins(admin, platformMailer(), now, await runtimeEnvForAi()) }),
  "delivery.digests": async (admin, now) => ({ sent: await sendDueDigests(admin, now) }),
};

/** Delivery steps in the order a tick runs them: stages first, so what they make due goes out in the same tick. */
export const DELIVERY_ORDER: readonly DeliveryStep[] = [
  "delivery.stages",
  "delivery.health",
  "delivery.due",
  "delivery.notices",
  "delivery.proposals",
  "delivery.stale",
  "delivery.senders",
  "delivery.key-alert",
  "delivery.digests",
] satisfies readonly JobStep[];

/**
 * Runs the delivery steps GitHub has not done recently, in order, for the
 * Vercel fallback. One step failing never stops the next; nothing is thrown.
 */
export async function runDeliveryFallback(
  admin: SupabaseClient,
  now: Date,
  heartbeats: { fresh: ReadonlySet<string>; lastOkAt: ReadonlyMap<string, Date> },
  steps: Partial<Record<DeliveryStep, Run>> = {},
): Promise<{ ran: DeliveryStep[]; summary: Partial<Record<DeliveryStep, StepSummary>> }> {
  const ran: DeliveryStep[] = [];
  const summary: Partial<Record<DeliveryStep, StepSummary>> = {};
  for (const step of DELIVERY_ORDER) {
    if (heartbeats.fresh.has(step)) continue;
    ran.push(step);
    try {
      summary[step] = await (steps[step] ?? DELIVERY_STEPS[step])(admin, now, { lastOkAt: heartbeats.lastOkAt.get(step) ?? null });
    } catch (thrown) {
      log.warn("delivery step failed", { step, reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["step", "reason"] });
    }
  }
  return { ran, summary };
}
