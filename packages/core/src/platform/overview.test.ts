import { describe, expect, it } from "vitest";

import { JOB_STEPS } from "../jobs/heartbeat";
import {
  deltaWords,
  growth,
  homesendAdded,
  jobStatuses,
  needsYou,
  openingSentence,
  parseOverview,
  plansAddUp,
  type DailyPoint,
  type OverviewSnapshot,
} from "./overview";

const NOW = new Date("2026-11-07T18:00:00Z");
const recent = new Date(NOW.getTime() - 5 * 60_000).toISOString();

const day = (i: number, over: Partial<DailyPoint> = {}): DailyPoint => ({
  day: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
  newHouseholds: 0,
  newPeople: 0,
  activeHouseholds: 0,
  activePeople: 0,
  turns: 0,
  homesendItems: 0,
  homesendFailed: 0,
  remindersDelivered: 0,
  deliveryFailed: 0,
  ...over,
});

/** A quiet, healthy platform: every job fresh on GitHub, nothing failing. */
function healthy(): OverviewSnapshot {
  return {
    takenAt: NOW.toISOString(),
    totals: { households: 11, people: 19, supportGrantsOpen: 0 },
    byPlan: [
      { plan: "free", households: 8 },
      { plan: "max", households: 2 },
      { plan: "pro", households: 1 },
    ],
    daily: Array.from({ length: 60 }, (_, i) => day(i, { turns: 1, newHouseholds: i >= 53 ? 1 : 0 })),
    active: {
      last7: { households: 3, people: 3 },
      prev7: { households: 1, people: 1 },
      last30: { households: 4, people: 6 },
      prev30: { households: 1, people: 2 },
    },
    homesendAdded: {
      last7: { confirmed: 1, checking: 10 },
      prev7: { confirmed: 12, checking: 0 },
      last30: { confirmed: 19, checking: 10 },
      prev30: { confirmed: 8, checking: 0 },
    },
    last24h: { homesendFailed: 0, homesendItems: 1, deliveryFailed: 0, delivered: 4, hometalkTurns: 5, hometalkFailed: 0 },
    hometalk7d: { turns: 2, failed: 0, p95Ms: 4372 },
    quietSetups: 0,
    aiKeyAlerts: [],
    billing: { openFindings: 0, failedPayments7d: 0, lastRun: null },
    jobs: Object.keys(JOB_STEPS).map((step) => ({ step, runner: "github", lastOkAt: recent, lastErrorAt: null, lastError: null, runUrl: null })),
    migrations: { latest: "20261107230000", count: 228 },
  };
}

const settingsClean = { saved: 23, environment: 0, stillInVercel: 0, storeReady: true };

describe("needsYou", () => {
  it("is empty, and the sentence says so, when no signal is raised", () => {
    const items = needsYou(healthy(), settingsClean, { source: "baseline", gated: 4, accepted: 4 }, NOW);
    expect(items).toEqual([]);
    expect(openingSentence(items)).toBe("All systems healthy. Nothing needs you right now.");
  });

  it("names the settings tidy-ups in the owner's words", () => {
    const items = needsYou(healthy(), { saved: 23, environment: 1, stillInVercel: 23, storeReady: true }, null, NOW);
    expect(items.map((i) => i.kind)).toEqual(["settings-from-vercel", "vercel-variables"]);
    expect(openingSentence(items)).toBe(
      "All systems healthy. 2 things need you: 1 setting still comes from Vercel, 23 Vercel variables can be deleted.",
    );
  });

  it("says nothing about settings when the store is unreachable", () => {
    expect(needsYou(healthy(), { saved: 0, environment: 40, stillInVercel: 0, storeReady: false }, null, NOW)).toEqual([]);
  });

  it("raises a failing job first, with its error and run link", () => {
    const s = healthy();
    s.jobs[0] = { ...s.jobs[0]!, lastErrorAt: NOW.toISOString(), lastError: "AI key missing", runUrl: "https://github.com/luvchakra/wonder-home/actions/runs/1" };
    s.quietSetups = 2;
    const items = needsYou(s, settingsClean, null, NOW);
    expect(items[0]).toMatchObject({ kind: "jobs-failing", severity: "critical", action: { href: "https://github.com/luvchakra/wonder-home/actions/runs/1" } });
    expect(items[0]?.why).toContain("AI key missing");
    expect(items.at(-1)?.kind).toBe("quiet-setups");
    expect(openingSentence(items)).toMatch(/^1 problem to fix\. 2 things need you: the background job /);
  });

  it("raises stale jobs (GitHub stopped), and a missing heartbeat counts as stale", () => {
    const s = healthy();
    s.jobs = s.jobs.slice(1).map((j, i) => (i === 0 ? { ...j, lastOkAt: "2026-11-01T00:00:00Z" } : j));
    const items = needsYou(s, settingsClean, null, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "jobs-stale", title: "2 background jobs stopped running on GitHub" });
  });

  it("raises AI key alerts, billing differences and open support grants from their rows", () => {
    const s = healthy();
    s.aiKeyAlerts = [{ provider: "anthropic", kind: "key_rejected", failures: 7, lastSeenAt: recent }];
    s.billing = { openFindings: 2, failedPayments7d: 1, lastRun: { outcome: "completed", at: recent } };
    s.totals.supportGrantsOpen = 1;
    const kinds = needsYou(s, settingsClean, null, NOW).map((i) => i.kind);
    expect(kinds).toEqual(["ai-key", "billing", "payments-failed", "support-grants"]);
  });

  it("raises HomeTalk, HomeSend and delivery failures only over their thresholds", () => {
    const s = healthy();
    s.last24h = { homesendFailed: 2, homesendItems: 9, deliveryFailed: 2, delivered: 100, hometalkTurns: 100, hometalkFailed: 5 };
    expect(needsYou(s, settingsClean, null, NOW)).toEqual([]);

    s.last24h = { homesendFailed: 4, homesendItems: 9, deliveryFailed: 5, delivered: 20, hometalkTurns: 10, hometalkFailed: 3 };
    expect(needsYou(s, settingsClean, null, NOW).map((i) => i.kind)).toEqual(["hometalk-failing", "homesend-failures", "delivery-failures"]);

    // A HomeSend spike is measured against the week before: four a day is usual, four today is not a spike.
    s.daily = s.daily.map((d) => ({ ...d, homesendFailed: 4 }));
    expect(needsYou(s, settingsClean, null, NOW).map((i) => i.kind)).not.toContain("homesend-failures");
  });

  it("raises advisor findings only from a live read beyond the baseline", () => {
    expect(needsYou(healthy(), settingsClean, { source: "baseline", gated: 9, accepted: 4 }, NOW)).toEqual([]);
    expect(needsYou(healthy(), settingsClean, { source: "live", gated: 6, accepted: 4 }, NOW)[0]?.title).toBe("the database advisor has 2 new findings");
  });

  it("lists three in the sentence and counts the rest", () => {
    const s = healthy();
    s.quietSetups = 1;
    s.totals.supportGrantsOpen = 2;
    s.billing.failedPayments7d = 3;
    const items = needsYou(s, { saved: 1, environment: 2, stillInVercel: 3, storeReady: true }, null, NOW);
    expect(items).toHaveLength(5);
    expect(openingSentence(items)).toMatch(/and 2 more\.$/);
  });
});

describe("jobStatuses", () => {
  it("covers every known step", () => {
    expect(jobStatuses([], NOW).map((j) => j.step)).toEqual(Object.keys(JOB_STEPS));
    expect(jobStatuses(healthy().jobs, NOW).every((j) => j.state === "healthy")).toBe(true);
  });
});

describe("growth", () => {
  it("adds the daily series up for the period and the one before", () => {
    const s = healthy();
    const week = growth(s, 7);
    const newHouseholds = week.find((m) => m.key === "newHouseholds");
    expect(newHouseholds).toMatchObject({ value: 7, previous: 0 });
    expect(newHouseholds?.series).toHaveLength(7);
    expect(week.find((m) => m.key === "turns")).toMatchObject({ value: 7, previous: 7 });
    expect(growth(s, 30).find((m) => m.key === "turns")).toMatchObject({ value: 30, previous: 30 });
    expect(week.find((m) => m.key === "activePeople")).toMatchObject({ value: 3, previous: 1 });
  });

  it("puts deltas in words", () => {
    expect(deltaWords(5, 3, 7)).toBe("+2 on the 7 days before");
    expect(deltaWords(1, 3, 30)).toBe("−2 on the 30 days before");
    expect(deltaWords(4, 4, 7)).toBe("Same as the 7 days before");
  });

  it("splits HomeSend entries into confirmed and checking that add up", () => {
    expect(homesendAdded(healthy(), 7)).toEqual({ confirmed: 1, checking: 10, total: 11 });
  });

  it("has plans adding up to the households total, and says when they don't", () => {
    expect(plansAddUp(healthy())).toMatchObject({ total: 11, addsUp: true });
    const s = healthy();
    s.totals.households = 12;
    expect(plansAddUp(s).addsUp).toBe(false);
  });
});

describe("parseOverview", () => {
  it("reads the RPC's shape and refuses anything else", () => {
    const parsed = parseOverview(JSON.parse(JSON.stringify(healthy())));
    expect(parsed).toEqual(healthy());
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview({ totals: {} })).toBeNull();
  });

  it("turns numeric strings into numbers and tolerates missing parts", () => {
    const parsed = parseOverview({ totals: { households: "3" }, daily: [], migrations: null });
    expect(parsed?.totals.households).toBe(3);
    expect(parsed?.migrations).toBeNull();
    expect(parsed?.billing.lastRun).toBeNull();
  });
});
