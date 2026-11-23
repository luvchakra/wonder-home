import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { DELIVERY_ORDER, DELIVERY_STEPS, noticesSince, runDeliveryFallback, type DeliveryStep } from "./delivery";
import { githubHeartbeats, type Heartbeat, type JobStep } from "./heartbeat";
import { runJob, type StepRunner } from "./runner";

/**
 * The delivery clock on GitHub (`delivery-clock.yml`, 2026-11-23) beside the
 * Vercel dispatch tick that is now its fallback: fresh heartbeats make Vercel
 * skip, stale ones make it run, and both at once never deliver twice.
 */

type Row = Record<string, unknown>;

/**
 * Just enough of the Supabase client for the heartbeat table and the due-reminder claim
 * (`deliverDueNotifications`: an `update … where status = 'generated' returning`).
 * Each awaited query runs in one go, as one statement does in Postgres.
 */
function fakeAdmin(notifications: Row[] = []) {
  const heartbeats = new Map<string, Heartbeat & Row>();
  const admin = {
    from(table: string) {
      if (table === "platform_job_heartbeats") {
        return {
          upsert: async (row: Heartbeat & Row) => {
            heartbeats.set(row.step, { ...(heartbeats.get(row.step) ?? { last_ok_at: null }), ...row });
            return { error: null };
          },
          select: () => ({
            in: async (_column: string, steps: string[]) => ({ data: steps.flatMap((step) => (heartbeats.has(step) ? [heartbeats.get(step)!] : [])), error: null }),
          }),
        };
      }
      if (table === "notifications") {
        const filters: ((row: Row) => boolean)[] = [];
        let patch: Row | null = null;
        const query = {
          select: () => query,
          update: (values: Row) => ((patch = values), query),
          eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
          lte: (column: string, value: string) => (filters.push((row) => String(row[column]) <= value), query),
          limit: () => query,
          then(resolve: (value: { data: Row[]; error: null }) => void) {
            const matched = notifications.filter((row) => filters.every((filter) => filter(row)));
            if (patch) for (const row of matched) Object.assign(row, patch);
            resolve({ data: matched.map((row) => ({ ...row })), error: null });
          },
        };
        return query;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
  return { admin, heartbeats };
}

const at = (iso: string) => new Date(iso);
const PUSH_ENV = {
  WONDERHOME_VAPID_PUBLIC_KEY: "B".repeat(87),
  WONDERHOME_VAPID_PRIVATE_KEY: "p".repeat(43),
  WONDERHOME_SMTP_HOST: "smtp.example.test",
  WONDERHOME_SMTP_USER: "clock@example.test",
  WONDERHOME_SMTP_PASSWORD: "not-a-real-password",
};

/** Every delivery step replaced by a counter, so a run touches nothing but the heartbeats. */
function countingSteps(counts: Map<string, number>, prefix: string): Record<DeliveryStep, StepRunner> {
  return Object.fromEntries(
    DELIVERY_ORDER.map((step) => [step, async () => (counts.set(`${prefix}:${step}`, (counts.get(`${prefix}:${step}`) ?? 0) + 1), { n: 1 })]),
  ) as unknown as Record<DeliveryStep, StepRunner>;
}

describe("the delivery job on GitHub", () => {
  it("runs every step and writes a heartbeat for each when push and mail keys are saved", async () => {
    const { admin, heartbeats } = fakeAdmin();
    const counts = new Map<string, number>();
    const result = await runJob(admin, "delivery", { env: PUSH_ENV, now: at("2026-11-23T02:00:00Z"), runners: countingSteps(counts, "github") });
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.state)).toEqual(DELIVERY_ORDER.map(() => "done"));
    expect([...heartbeats.keys()].sort()).toEqual([...DELIVERY_ORDER].sort());
  });

  it("leaves every sending step to Vercel when no push keys are saved, and writes no heartbeat for them", async () => {
    const { admin, heartbeats } = fakeAdmin();
    const result = await runJob(admin, "delivery", { env: {}, now: at("2026-11-23T02:00:00Z"), runners: countingSteps(new Map(), "github") });
    expect(result.ok).toBe(true);
    expect(result.steps.filter((s) => s.state === "done").map((s) => s.step)).toEqual(["delivery.stages", "delivery.stale", "delivery.senders"]);
    expect([...heartbeats.keys()].sort()).toEqual(["delivery.senders", "delivery.stages", "delivery.stale"]);
  });
});

describe("the Vercel dispatch tick as the fallback", () => {
  it("skips every delivery step while GitHub's heartbeats are fresh", async () => {
    const { admin } = fakeAdmin();
    const counts = new Map<string, number>();
    await runJob(admin, "delivery", { env: PUSH_ENV, now: at("2026-11-23T02:00:00Z"), runners: countingSteps(counts, "github") });
    const now = at("2026-11-23T02:14:00Z");
    const fallback = await runDeliveryFallback(admin, now, await githubHeartbeats(admin, DELIVERY_ORDER, now), countingSteps(counts, "vercel"));
    expect(fallback.ran).toEqual([]);
    expect([...counts.keys()].some((key) => key.startsWith("vercel:"))).toBe(false);
  });

  it("does each step itself once its heartbeat is over 15 minutes old", async () => {
    const { admin } = fakeAdmin();
    const counts = new Map<string, number>();
    await runJob(admin, "delivery", { env: PUSH_ENV, now: at("2026-11-23T02:00:00Z"), runners: countingSteps(counts, "github") });
    const now = at("2026-11-23T02:16:00Z");
    const fallback = await runDeliveryFallback(admin, now, await githubHeartbeats(admin, DELIVERY_ORDER, now), countingSteps(counts, "vercel"));
    expect(fallback.ran).toEqual(DELIVERY_ORDER);
  });

  it("does only the steps GitHub left: a run without push keys leaves the sending steps to Vercel", async () => {
    const { admin } = fakeAdmin();
    const counts = new Map<string, number>();
    await runJob(admin, "delivery", { env: {}, now: at("2026-11-23T02:00:00Z"), runners: countingSteps(counts, "github") });
    const now = at("2026-11-23T02:05:00Z");
    const fallback = await runDeliveryFallback(admin, now, await githubHeartbeats(admin, DELIVERY_ORDER, now), countingSteps(counts, "vercel"));
    expect(fallback.ran).toEqual(["delivery.health", "delivery.due", "delivery.notices", "delivery.proposals", "delivery.key-alert", "delivery.digests"]);
  });

  it("does everything when the heartbeats can't be read", async () => {
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: "42P01" } }) }) }) } as unknown as SupabaseClient;
    const now = at("2026-11-23T02:05:00Z");
    const fallback = await runDeliveryFallback(broken, now, await githubHeartbeats(broken, DELIVERY_ORDER, now), countingSteps(new Map(), "vercel"));
    expect(fallback.ran).toEqual(DELIVERY_ORDER);
  });

  it("keeps going when a step throws", async () => {
    const { admin } = fakeAdmin();
    const counts = new Map<string, number>();
    const steps = { ...countingSteps(counts, "vercel"), "delivery.health": async () => Promise.reject(new TypeError("down")) };
    const now = at("2026-11-23T02:05:00Z");
    const fallback = await runDeliveryFallback(admin, now, await githubHeartbeats(admin, DELIVERY_ORDER, now), steps);
    expect(fallback.ran).toEqual(DELIVERY_ORDER);
    expect(counts.get("vercel:delivery.digests")).toBe(1);
  });
});

describe("both sides at once", () => {
  it("delivers each due reminder exactly once, whichever side claims it", async () => {
    const due = (id: string, household: string, minutesAgo: number): Row => ({
      id,
      household_id: household,
      status: "generated",
      // Kept as plain ids, so the claim is what's tested and nothing is pushed.
      source_type: null,
      scheduled_for: new Date(at("2026-11-23T02:00:00Z").getTime() - minutesAgo * 60_000).toISOString(),
      recipient_member_id: "m",
      title: "t",
      body: "b",
      message: null,
      priority: "normal",
      category: null,
    });
    const notifications = [due("1", "h1", 1), due("2", "h1", 3), due("3", "h2", 0), due("4", "h3", 12)];
    const { admin } = fakeAdmin(notifications);
    const now = at("2026-11-23T02:00:00Z");
    const only = (step: DeliveryStep) => Object.fromEntries(DELIVERY_ORDER.filter((s) => s !== step).map((s) => [s, async () => ({})])) as Partial<Record<JobStep, StepRunner>>;

    // GitHub's run and a Vercel tick that read a stale heartbeat, at the same moment.
    const [github, vercel] = await Promise.all([
      runJob(admin, "delivery", { env: PUSH_ENV, now, runners: only("delivery.due") }),
      runDeliveryFallback(admin, now, { fresh: new Set(), lastOkAt: new Map() }, only("delivery.due")),
    ]);
    const githubDelivered = Number(github.steps.find((s) => s.step === "delivery.due")?.summary?.delivered ?? 0);
    const vercelDelivered = Number(vercel.summary["delivery.due"]?.delivered ?? 0);
    expect(githubDelivered + vercelDelivered).toBe(notifications.length);
    expect(notifications.every((row) => row.status === "delivered")).toBe(true);

    // A second pass on either side finds nothing left to claim.
    const again = await DELIVERY_STEPS["delivery.due"](admin, now, {});
    expect(again.delivered).toBe(0);
  });
});

describe("noticesSince", () => {
  const now = at("2026-11-23T02:00:00Z");
  const minutesBefore = (date: Date) => (now.getTime() - date.getTime()) / 60_000;

  it("looks back one tick's gap normally, and to the last clean run when that is longer and recent", () => {
    expect(minutesBefore(noticesSince(now, null))).toBe(6);
    expect(minutesBefore(noticesSince(now, at("2026-11-23T01:57:00Z")))).toBe(6);
    expect(minutesBefore(noticesSince(now, at("2026-11-23T01:40:00Z")))).toBe(21);
  });

  it("never looks back past half an hour: by then the other side was sweeping", () => {
    expect(minutesBefore(noticesSince(now, at("2026-11-22T23:00:00Z")))).toBe(6);
  });
});
