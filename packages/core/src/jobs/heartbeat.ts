import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";

/**
 * Background steps that run on GitHub Actions (the owner, 2026-11-07: "to
 * reduce load on Vercel, transfer processes to GitHub as much as possible"),
 * and how Vercel knows to leave them alone.
 *
 * Each step the runner finishes cleanly writes its heartbeat
 * (`platform_job_heartbeats`). The Vercel side of the same step — the
 * delivery clock, the daily cron, the calendar sync — asks `ranOnGitHub` and
 * skips the step while the heartbeat is fresh. When GitHub stops (a schedule
 * dropped, a secret missing, a red run) the heartbeat goes stale and Vercel
 * does the step again by itself. So there is no switch to flip, and at worst a
 * step runs on both: harmless, because every step keeps its own claims (a
 * household's day row, a lease, a compare-and-set update).
 *
 * A step the runner could not do properly (tidy and sleep without an AI key)
 * writes no heartbeat, so Vercel keeps it.
 */
export const JOB_STEPS = {
  // The delivery clock (`delivery-clock.yml`, 2026-11-23), dispatched every 5 minutes by pg_cron through the GitHub
  // API. Fresh for 15 minutes: three missed dispatches in a row and Vercel's own 5-minute tick takes delivery back.
  /** Reminders whose next stage is due ("tonight" → "this morning") move on. */
  "delivery.stages": { staleAfterMinutes: 15 },
  /** Health reminders on the household's own clock (appointments, measurement routines). */
  "delivery.health": { staleAfterMinutes: 15 },
  /** Due reminders delivered in the app and pushed, through `deliverNotification`. */
  "delivery.due": { staleAfterMinutes: 15 },
  /** Notices (module 27) for households whose records changed since the last run. */
  "delivery.notices": { staleAfterMinutes: 15 },
  /** Waiting actions reminded once, closed after 48 h, and those whose moment has passed closed (2026-11-14, 2026-11-23). */
  "delivery.proposals": { staleAfterMinutes: 15 },
  /** Notifications that no longer apply cleared, with their reason (2026-11-22). */
  "delivery.stale": { staleAfterMinutes: 15 },
  /** New email senders nobody answered about in 3 days: their mail set aside. */
  "delivery.senders": { staleAfterMinutes: 15 },
  /** An alert on WonderHome's own AI key, to the platform admins, once (14-048). */
  "delivery.key-alert": { staleAfterMinutes: 15 },
  /** Morning digests whose time has come on their household's clock (27-008). */
  "delivery.digests": { staleAfterMinutes: 15 },
  /** Rebuilds a few HomeBrain household contexts that are behind or over an hour old. */
  "clock.context-warm": { staleAfterMinutes: 30 },
  /** Writes the record index's facts for records whose own drain did not run. */
  "clock.knowledge": { staleAfterMinutes: 30 },
  /** HomeSend's 30-day archive, on each household's calendar. */
  "clock.homesend-archive": { staleAfterMinutes: 30 },
  /** HomeSend's daily tidy, from 04:00 on each household's clock, once a day. */
  "clock.homesend-tidy": { staleAfterMinutes: 30 },
  /** "Nothing waits" (2026-11-14): due "Needs you" defaults applied, and every waiting HomeSend item ended as something. */
  "clock.homesend-deadlines": { staleAfterMinutes: 30 },
  /** HomeBrain Sleep, 2–5 am on each household's clock, once a night. */
  "clock.homebrain-sleep": { staleAfterMinutes: 30 },
  /** Kids Trivia's low card pools, refilled a few at a time (08-035). */
  "clock.trivia-refill": { staleAfterMinutes: 30 },
  /** Subscribed calendar feeds whose next sync has come. */
  "calendar-sync": { staleAfterMinutes: 45 },
  /** Developer webhooks waiting to be delivered or retried. */
  webhooks: { staleAfterMinutes: 180 },
  /** The nightly retention sweeps that send nothing (purge, cleanup, handoffs, deletions, old events, catalog). */
  "daily.retention": { staleAfterMinutes: 26 * 60 },
} as const;

export type JobStep = keyof typeof JOB_STEPS;

export type Heartbeat = { step: string; runner: string; last_ok_at: string | null };

/** True when the GitHub runner finished this step recently enough that Vercel can skip it. */
export function isFresh(heartbeat: Heartbeat | null | undefined, step: JobStep, now: Date): boolean {
  if (!heartbeat || heartbeat.runner !== "github" || !heartbeat.last_ok_at) return false;
  const at = Date.parse(heartbeat.last_ok_at);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  // A heartbeat from the future (a clock skewed by minutes) still counts; one far ahead does not.
  if (age < -5 * 60_000) return false;
  return age <= JOB_STEPS[step].staleAfterMinutes * 60_000;
}

/** What one read of the heartbeats says: the steps GitHub did recently, and when each last finished cleanly (any runner). */
export type GitHubHeartbeats = { fresh: Set<JobStep>; lastOkAt: Map<JobStep, Date> };

/**
 * The steps GitHub has done recently, with each step's last clean finish, in
 * one read. Any failure — the table not there yet, the database slow — answers
 * "none", so Vercel does the work.
 */
export async function githubHeartbeats(admin: SupabaseClient, steps: readonly JobStep[], now: Date): Promise<GitHubHeartbeats> {
  const result: GitHubHeartbeats = { fresh: new Set(), lastOkAt: new Map() };
  if (steps.length === 0) return result;
  try {
    const { data, error } = await admin.from("platform_job_heartbeats").select("step, runner, last_ok_at").in("step", steps as string[]);
    if (error) return result;
    const byStep = new Map(((data ?? []) as Heartbeat[]).map((row) => [row.step, row]));
    for (const step of steps) {
      const row = byStep.get(step);
      if (isFresh(row, step, now)) result.fresh.add(step);
      const at = row?.last_ok_at ? Date.parse(row.last_ok_at) : Number.NaN;
      if (Number.isFinite(at)) result.lastOkAt.set(step, new Date(at));
    }
  } catch {
    return { fresh: new Set(), lastOkAt: new Map() };
  }
  return result;
}

/** The steps GitHub has done recently, in one read; any failure answers "none". */
export async function ranOnGitHub(admin: SupabaseClient, steps: readonly JobStep[], now: Date): Promise<Set<JobStep>> {
  return (await githubHeartbeats(admin, steps, now)).fresh;
}

/** Counts only, for the run's record: never an id, a title or a household. */
export type StepSummary = Record<string, number | boolean | string | null>;

/** Records that the runner finished a step (or failed it). A failure to record is logged, never thrown. */
export async function recordHeartbeat(
  admin: SupabaseClient,
  step: JobStep,
  outcome: { ok: true; summary: StepSummary } | { ok: false; error: string },
  context: { now: Date; runUrl?: string; runner?: "github" | "manual" },
): Promise<void> {
  const at = context.now.toISOString();
  const row: Record<string, unknown> = outcome.ok
    ? { step, runner: context.runner ?? "github", last_ok_at: at, summary: outcome.summary, run_url: context.runUrl ?? null, updated_at: at }
    : { step, runner: context.runner ?? "github", last_error_at: at, last_error: outcome.error.slice(0, 200), run_url: context.runUrl ?? null, updated_at: at };
  try {
    const { error } = await admin.from("platform_job_heartbeats").upsert(row, { onConflict: "step" });
    if (error) log.warn("job heartbeat not recorded", { step, code: error.code ?? "unknown", allow: ["step", "code"] });
  } catch (thrown) {
    log.warn("job heartbeat not recorded", { step, reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["step", "reason"] });
  }
}
