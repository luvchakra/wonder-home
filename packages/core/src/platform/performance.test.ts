import { describe, expect, it } from "vitest";

import {
  cacheStatus,
  computeTips,
  connectionStatus,
  countAdvisorLints,
  parseSnapshot,
  routeStatus,
  seqScanStatus,
  type Snapshot,
} from "./performance";

const base: Snapshot = {
  statements: { byTotal: [], byMean: [] },
  cache: { tableHit: 0.999, indexHit: 0.999 },
  largestTables: [],
  largestIndexes: [],
  seqScanHeavy: [],
  unusedIndexes: { count: 0, bytes: 0 },
  unusedIndexList: [],
  duplicateIndexes: [],
  deadTuples: [],
  connections: { max: 60, reserved: 3, total: 10, active: 1, idle: 9, idleInTransaction: 0 },
  takenAt: "2026-10-29T00:00:00Z",
};

describe("statuses", () => {
  it("reads cache ratios in words", () => {
    expect(cacheStatus(0.999)).toBe("good");
    expect(cacheStatus(0.97)).toBe("watch");
    expect(cacheStatus(0.8)).toBe("act");
    expect(cacheStatus(null)).toBeNull();
  });
  it("flags a pool near its limit and transactions left open", () => {
    expect(connectionStatus(base.connections)).toBe("good");
    expect(connectionStatus({ ...base.connections, total: 40 })).toBe("watch");
    expect(connectionStatus({ ...base.connections, total: 52 })).toBe("act");
    expect(connectionStatus({ ...base.connections, idleInTransaction: 1 })).toBe("watch");
  });
  it("ignores small tables for sequential scans", () => {
    expect(seqScanStatus({ name: "t", seq_scan: 9, idx_scan: 1, rows: 16, seq_tup_read: 100 })).toBe("good");
    expect(seqScanStatus({ name: "t", seq_scan: 9, idx_scan: 1, rows: 5000, seq_tup_read: 100 })).toBe("watch");
    expect(seqScanStatus({ name: "t", seq_scan: 9, idx_scan: 1, rows: 90000, seq_tup_read: 100 })).toBe("act");
  });
  it("grades route bundles", () => {
    expect(routeStatus(150_000)).toBe("good");
    expect(routeStatus(210_000)).toBe("watch");
    expect(routeStatus(241_400)).toBe("act");
  });
});

describe("computeTips", () => {
  it("gives no tips for a healthy, empty input", () => {
    expect(computeTips({ snapshot: base, advisors: null, budgets: null })).toEqual([]);
  });

  it("orders by severity, then impact, and names the plan story", () => {
    const tips = computeTips({
      snapshot: {
        ...base,
        cache: { tableHit: 0.9, indexHit: 0.999 },
        seqScanHeavy: [{ name: "family_events", seq_scan: 500, idx_scan: 2, rows: 5000, seq_tup_read: 2_500_000 }],
      },
      advisors: null,
      budgets: { sharedCapGz: 138_500, routes: [{ route: "/ai", capGz: 241_400 }], queries: [] },
    });
    expect(tips.map((t) => t.id)).toEqual(["cache-table", "route-/ai", "seq-family_events"]);
    expect(tips[0]?.severity).toBe("act");
    expect(tips.every((t) => /^(PERF|SEC)-/.test(t.story))).toBe(true);
  });

  it("flags advisor findings above the accepted list", () => {
    const tips = computeTips({ snapshot: null, advisors: { source: "live", gated: 30, info: 0, accepted: 26, byLint: {} }, budgets: null });
    expect(tips[0]).toMatchObject({ id: "advisors-new", severity: "act" });
  });

  it("never carries a literal from a query into a tip beyond its shape", () => {
    const tips = computeTips({
      snapshot: { ...base, statements: { byTotal: [], byMean: [{ shape: "select * from t where id = ?", calls: 9, total_ms: 9000, mean_ms: 1000 }] } },
      advisors: null,
      budgets: null,
    });
    expect(tips[0]?.finding).toContain("select * from t where id = ?");
  });
});

describe("parsing", () => {
  it("rejects what is not a snapshot", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({})).toBeNull();
  });
  it("accepts numeric strings from the database", () => {
    const parsed = parseSnapshot({ cache: { tableHit: "0.99", indexHit: null }, connections: { max: "60", total: "9" }, deadTuples: [{ name: "t", live: "1", dead: "2", dead_pct: "66.7" }] });
    expect(parsed?.cache.tableHit).toBe(0.99);
    expect(parsed?.cache.indexHit).toBeNull();
    expect(parsed?.connections.max).toBe(60);
    expect(parsed?.deadTuples[0]?.dead_pct).toBe(66.7);
  });
  it("counts advisor lints, flat or grouped", () => {
    expect(countAdvisorLints({ lints: [{ name: "a", level: "WARN" }, { name: "b", level: "INFO", findings: [{}, {}] }] })).toEqual({ gated: 1, info: 2, byLint: { a: 1 } });
  });
});
