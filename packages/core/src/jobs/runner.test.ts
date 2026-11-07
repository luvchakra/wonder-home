import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { isFresh, ranOnGitHub, type Heartbeat, type JobStep } from "./heartbeat";
import { JOBS, runJob, type StepRunner } from "./runner";

/** The heartbeat table, in memory: just enough of the client for `recordHeartbeat` and `ranOnGitHub`. */
function fakeAdmin() {
  const rows = new Map<string, Heartbeat & Record<string, unknown>>();
  const admin = {
    from(table: string) {
      if (table !== "platform_job_heartbeats") throw new Error(`unexpected table ${table}`);
      return {
        upsert: async (row: Heartbeat & Record<string, unknown>) => {
          rows.set(row.step, { ...(rows.get(row.step) ?? { last_ok_at: null }), ...row });
          return { error: null };
        },
        select: () => ({
          in: async (_column: string, steps: string[]) => ({ data: steps.flatMap((step) => (rows.has(step) ? [rows.get(step)!] : [])), error: null }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { admin, rows };
}

const ENV = { WONDERHOME_AI_KEY: "test-platform-key", WONDERHOME_AI_PROVIDER: "anthropic" };
const at = (iso: string) => new Date(iso);

describe("isFresh", () => {
  const now = at("2026-11-07T10:00:00Z");
  const beat = (lastOk: string | null, runner = "github"): Heartbeat => ({ step: "clock.knowledge", runner, last_ok_at: lastOk });

  it("is fresh inside the step's window and stale after it", () => {
    expect(isFresh(beat("2026-11-07T09:31:00Z"), "clock.knowledge", now)).toBe(true);
    expect(isFresh(beat("2026-11-07T09:29:00Z"), "clock.knowledge", now)).toBe(false);
    expect(isFresh(beat("2026-11-06T09:00:00Z"), "daily.retention", now)).toBe(true);
    expect(isFresh(beat("2026-11-06T07:59:00Z"), "daily.retention", now)).toBe(false);
  });

  it("never counts a missing row, a failure-only row, a run off GitHub or one far in the future", () => {
    expect(isFresh(null, "webhooks", now)).toBe(false);
    expect(isFresh(beat(null), "webhooks", now)).toBe(false);
    expect(isFresh(beat("2026-11-07T09:59:00Z", "manual"), "webhooks", now)).toBe(false);
    expect(isFresh(beat("2026-11-07T11:00:00Z"), "webhooks", now)).toBe(false);
    expect(isFresh(beat("2026-11-07T10:03:00Z"), "webhooks", now)).toBe(true);
  });
});

describe("ranOnGitHub", () => {
  it("answers none when the table cannot be read, so Vercel does the work", async () => {
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: "42P01" } }) }) }) } as unknown as SupabaseClient;
    expect((await ranOnGitHub(broken, ["clock.knowledge"], new Date())).size).toBe(0);
    const throwing = { from: () => { throw new Error("down"); } } as unknown as SupabaseClient;
    expect((await ranOnGitHub(throwing, ["clock.knowledge"], new Date())).size).toBe(0);
  });
});

describe("runJob", () => {
  it("leaves the model steps to Vercel when the runner has no AI key, and writes no heartbeat for them", async () => {
    const { admin, rows } = fakeAdmin();
    const ok: StepRunner = async () => ({ n: 1 });
    const runners = Object.fromEntries(JOBS.clock.map((step) => [step, ok])) as Partial<Record<JobStep, StepRunner>>;
    const result = await runJob(admin, "clock", { env: {}, runners, now: at("2026-11-07T10:00:00Z") });
    expect(result.ok).toBe(true);
    expect(result.steps.filter((s) => s.state === "left-to-vercel").map((s) => s.step)).toEqual(["clock.homesend-tidy", "clock.homebrain-sleep"]);
    expect([...rows.keys()].sort()).toEqual(["clock.context-warm", "clock.homesend-archive", "clock.knowledge"]);
  });

  it("dry run claims, writes and runs nothing", async () => {
    const { admin, rows } = fakeAdmin();
    let ran = 0;
    const runners = Object.fromEntries(JOBS.clock.map((step) => [step, async () => ((ran += 1), {})])) as Partial<Record<JobStep, StepRunner>>;
    const result = await runJob(admin, "clock", { env: ENV, runners, dryRun: true });
    expect(ran).toBe(0);
    expect(rows.size).toBe(0);
    expect(result.steps.every((s) => s.state === "dry-run")).toBe(true);
  });

  it("a failing step turns the run red, keeps the next steps going and leaves its last good time alone", async () => {
    const { admin, rows } = fakeAdmin();
    await runJob(admin, "webhooks", { env: ENV, now: at("2026-11-07T09:00:00Z"), runners: { webhooks: async () => ({ delivered: 1 }) } });
    const result = await runJob(admin, "clock", {
      env: ENV,
      now: at("2026-11-07T10:00:00Z"),
      runners: {
        "clock.context-warm": async () => {
          throw new TypeError("boom");
        },
        "clock.knowledge": async () => ({}),
        "clock.homesend-archive": async () => ({}),
        "clock.homesend-tidy": async () => ({}),
        "clock.homebrain-sleep": async () => ({}),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.steps.map((s) => s.state)).toEqual(["failed", "done", "done", "done", "done"]);
    expect(rows.get("clock.context-warm")).toMatchObject({ last_ok_at: null, last_error: "TypeError" });
    expect(rows.get("webhooks")?.last_ok_at).toBe("2026-11-07T09:00:00.000Z");
  });
});

/**
 * Three days of a late, irregular GitHub schedule (gaps of 7 to 41 minutes and
 * a two-hour outage) beside the delivery clock's steady 5 minutes. The tidy
 * step is modelled as it works: due from 04:00 on the household's own clock,
 * claimed once per household per local day. Whatever the order, every
 * household is tidied exactly once a day, and Vercel does it only while
 * GitHub's heartbeat is stale.
 */
describe("an irregular GitHub schedule beside the delivery clock", () => {
  const households = [
    { id: "a", timeZone: "Asia/Kolkata" },
    { id: "b", timeZone: "America/New_York" },
    { id: "c", timeZone: "Pacific/Auckland" },
  ];
  const localParts = (now: Date, timeZone: string) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  };

  it("tidies every household once per local day, with no gap and no repeat", async () => {
    const { admin } = fakeAdmin();
    const claims = new Map<string, "github" | "vercel">();
    const tidy = (by: "github" | "vercel"): StepRunner => async (_admin, now) => {
      let tidied = 0;
      for (const household of households) {
        const { day, hour } = localParts(now, household.timeZone);
        const key = `${household.id}:${day}`;
        if (hour < 4 || claims.has(key)) continue;
        claims.set(key, by);
        tidied += 1;
      }
      return { tidied };
    };

    const start = at("2026-11-07T00:00:00Z").getTime();
    const end = start + 3 * 86_400_000;
    // GitHub: irregular gaps, and nothing at all from 30:00 to 32:00.
    const gaps = [7, 12, 41, 9, 15, 23, 10, 31, 8, 18];
    const githubTimes: number[] = [];
    for (let t = start, i = 0; t < end; t += gaps[i++ % gaps.length]! * 60_000) {
      const hours = (t - start) / 3_600_000;
      if (hours >= 30 && hours < 32) continue;
      githubTimes.push(t);
    }
    const vercelTimes: number[] = [];
    for (let t = start + 2 * 60_000; t < end; t += 5 * 60_000) vercelTimes.push(t);
    const events = [...githubTimes.map((t) => ({ t, by: "github" as const })), ...vercelTimes.map((t) => ({ t, by: "vercel" as const }))].sort((x, y) => x.t - y.t);

    let vercelRanWhileFresh = 0;
    let vercelRanDuringOutage = 0;
    let lastGitHub = -Infinity;
    for (const event of events) {
      const now = new Date(event.t);
      if (event.by === "github") {
        lastGitHub = event.t;
        await runJob(admin, "clock", {
          env: ENV,
          now,
          runners: { "clock.context-warm": async () => ({}), "clock.knowledge": async () => ({}), "clock.homesend-archive": async () => ({}), "clock.homesend-tidy": tidy("github"), "clock.homebrain-sleep": async () => ({}) },
        });
      } else {
        const fresh = await ranOnGitHub(admin, ["clock.homesend-tidy"], now);
        if (fresh.has("clock.homesend-tidy")) continue;
        const hours = (event.t - start) / 3_600_000;
        if (hours >= 30.5 && hours < 32) vercelRanDuringOutage += 1;
        if (event.t - lastGitHub <= 30 * 60_000) vercelRanWhileFresh += 1;
        await tidy("vercel")(admin, now);
      }
    }

    // Every household, every local day it reached 04:00 in the window: exactly one claim (a Map cannot hold two).
    const expected = new Set<string>();
    for (let t = start; t < end; t += 60_000) {
      for (const household of households) {
        const { day, hour } = localParts(new Date(t), household.timeZone);
        if (hour >= 4) expected.add(`${household.id}:${day}`);
      }
    }
    expect(new Set(claims.keys())).toEqual(expected);
    // Vercel stepped in only once GitHub's last run was over 30 minutes old (a 41-minute gap, the outage).
    expect(vercelRanWhileFresh).toBe(0);
    expect(vercelRanDuringOutage).toBeGreaterThan(0);
    expect([...claims.values()].filter((by) => by === "github").length).toBeGreaterThan(expected.size / 2);
  });
});
