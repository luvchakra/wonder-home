import type { SupabaseClient } from "@supabase/supabase-js";

import { platformKey } from "../ai/model-key";
import { syncDueSubscriptions } from "../calendar/subscriptions/sync";
import { keepStoresWarm } from "../homebrain/context-store";
import { sleepDueHouseholds } from "../homebrain/sleep/run";
import { archiveStaleHomeSendItems } from "../homesend/repository";
import { runNeedsYouDeadlines } from "../hometalk/needs-you-run";
import { runHomeSendTidy } from "../homesend/tidy-run";
import { runTriviaRefill } from "../school/trivia-refill";
import { CLOCK_DRAIN_LIMIT, drainKnowledge } from "../knowledge/facts";
import { deliverPendingWebhooks } from "../webhooks/deliver";
import { runRetentionSweeps } from "./daily";
import { JOB_STEPS, recordHeartbeat, type JobStep, type StepSummary } from "./heartbeat";

/**
 * The background jobs the GitHub Actions runner does
 * (`.github/workflows/background-jobs.yml` → `scripts/jobs.mjs` → here), with
 * the same core code the Vercel routes call, straight against the database.
 *
 * Each job is a list of steps. A step runs, then writes its heartbeat, so the
 * Vercel side leaves it alone while it is fresh (`heartbeat.ts`). Steps keep
 * their own claims, so a late, doubled or overlapping run is harmless:
 *
 *  - clock: every 10 minutes. Batches are about twice the delivery clock's,
 *    which ticks every 5 — the same work per hour, in half the runs. Tidy
 *    ("from 04:00 on the household's clock") and Sleep ("2–5 am") are claimed
 *    once per household per local day, so a run that is late, skipped or
 *    doubled neither misses nor repeats a day: the first run inside the window
 *    does it, every later one finds the claim.
 *  - calendar-sync: every 15 minutes, the feeds whose next sync has come
 *    (claimed `for update skip locked`).
 *  - webhooks: hourly, developer webhooks waiting (once a day on Vercel's plan).
 *  - daily: the retention sweeps that send nothing.
 *
 * Nothing here pushes, mails or sends to a person: the steps that do
 * (reminders, digests, health, the retry queue) stay on the delivery clock,
 * which already calls `deliverNotification` within minutes.
 */
export const JOBS = {
  clock: ["clock.context-warm", "clock.knowledge", "clock.homesend-archive", "clock.homesend-tidy", "clock.homesend-deadlines", "clock.homebrain-sleep", "clock.trivia-refill"],
  "calendar-sync": ["calendar-sync"],
  webhooks: ["webhooks"],
  daily: ["daily.retention"],
} as const satisfies Record<string, readonly JobStep[]>;

export type JobName = keyof typeof JOBS;

export function isJobName(value: string): value is JobName {
  return Object.hasOwn(JOBS, value);
}

/** Steps that need a model: without the platform key they would run worse than Vercel does, so they are left to Vercel. */
const NEEDS_MODEL: ReadonlySet<JobStep> = new Set(["clock.homesend-tidy", "clock.homebrain-sleep"]);

/** What one step does, counts only. Injected in tests. */
export type StepRunner = (admin: SupabaseClient, now: Date) => Promise<StepSummary>;

export const STEP_RUNNERS: Record<JobStep, StepRunner> = {
  "clock.context-warm": async (admin, now) => ({ warmed: await keepStoresWarm(admin, now, 8) }),
  "clock.knowledge": async (admin, now) => {
    const result = await drainKnowledge(admin, { limit: CLOCK_DRAIN_LIMIT * 2, now });
    return { claimed: result.claimed, written: result.written, removed: result.removed, failed: result.failed };
  },
  "clock.homesend-archive": async (admin, now) => ({ archived: await archiveStaleHomeSendItems(admin, { now, limit: 400 }) }),
  "clock.homesend-tidy": async (admin, now) => {
    const result = await runHomeSendTidy(admin, { now, limit: 25 });
    return { ready: result.ready, households: result.households.length, archived: result.households.reduce((sum, h) => sum + h.archived.length, 0) };
  },
  "clock.homesend-deadlines": async (admin, now) => {
    const result = await runNeedsYouDeadlines(admin, { now, limit: 50 });
    return { ready: result.ready, defaulted: result.defaulted, expired: result.expired, asked: result.asked, notes: result.notes, setAside: result.setAside, readAgain: result.readAgain, proposalsClosed: result.proposalsClosed };
  },
  "clock.homebrain-sleep": async (admin, now) => ({ slept: (await sleepDueHouseholds(admin, now, 6)).length }),
  // Each refill uses the asking household's own model terms, not the runner's key: not a NEEDS_MODEL step.
  "clock.trivia-refill": async (admin, now) => {
    const result = await runTriviaRefill(admin, { now, limit: 4 });
    return { looked: result.looked, written: result.written, cards: result.cards };
  },
  "calendar-sync": async (admin, now) => {
    const result = await syncDueSubscriptions(admin, { now, limit: 50 });
    return { synced: result.synced, failed: result.failed };
  },
  webhooks: async (admin, now) => {
    // A batch is 50; keep going while batches come back full, at most ten.
    const totals = { delivered: 0, retrying: 0, exhausted: 0, skipped: 0 };
    for (let batch = 0; batch < 10; batch += 1) {
      const outcomes = await deliverPendingWebhooks(admin, now);
      for (const outcome of outcomes) totals[outcome.outcome] += 1;
      if (outcomes.length < 50) break;
    }
    return totals;
  },
  "daily.retention": async (admin, now) => {
    const result = await runRetentionSweeps(admin, now);
    const deleted = result.swept.reduce((sum, row) => sum + row.deleted, 0);
    if (result.partial) throw new PartialStepError(`partial: ${result.swept.filter((row) => row.error).length} tables failed, deletions ${result.deletionsFailed}`);
    return { deleted, deletionsFulfilled: result.deletionsFulfilled, catalogSaved: result.catalog?.saved ?? 0 };
  },
};

/** A step that did part of its work: no heartbeat (so Vercel keeps it), and the run is red. */
export class PartialStepError extends Error {
  override name = "PartialStepError";
}

export type StepReport = { step: JobStep; state: "done" | "failed" | "left-to-vercel" | "dry-run"; summary?: StepSummary; reason?: string };

export type RunOptions = {
  now?: Date;
  /** Load and plan only: nothing is claimed, written or sent. */
  dryRun?: boolean;
  runUrl?: string;
  runner?: "github" | "manual";
  env?: Record<string, string | undefined>;
  runners?: Partial<Record<JobStep, StepRunner>>;
};

/** Runs one job's steps in order; one step failing never stops the next. */
export async function runJob(admin: SupabaseClient, job: JobName, options: RunOptions = {}): Promise<{ ok: boolean; steps: StepReport[] }> {
  const env = options.env ?? process.env;
  const hasModel = platformKey(env) !== null;
  const reports: StepReport[] = [];
  for (const step of JOBS[job]) {
    if (NEEDS_MODEL.has(step) && !hasModel) {
      reports.push({ step, state: "left-to-vercel", reason: "no WONDERHOME_AI_KEY on the runner" });
      continue;
    }
    if (options.dryRun) {
      reports.push({ step, state: "dry-run", reason: `would run; Vercel skips it for ${JOB_STEPS[step].staleAfterMinutes} min after` });
      continue;
    }
    // Each step reads the clock when it starts, so a long step before it does not leave it behind.
    const now = options.now ?? new Date();
    const run = options.runners?.[step] ?? STEP_RUNNERS[step];
    try {
      const summary = await run(admin, now);
      await recordHeartbeat(admin, step, { ok: true, summary }, { now: options.now ?? new Date(), runUrl: options.runUrl, runner: options.runner });
      reports.push({ step, state: "done", summary });
    } catch (thrown) {
      const reason = thrown instanceof PartialStepError ? thrown.message : thrown instanceof Error ? thrown.name : "error";
      await recordHeartbeat(admin, step, { ok: false, error: reason }, { now: options.now ?? new Date(), runUrl: options.runUrl, runner: options.runner });
      reports.push({ step, state: "failed", reason });
    }
  }
  return { ok: reports.every((report) => report.state !== "failed"), steps: reports };
}
