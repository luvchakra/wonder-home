import { describe, expect, it } from "vitest";

import { computeTips, type Snapshot } from "./performance";
import { actionsFor, dropIndexSql, dropIndexesSql, listIndexesSql, quoteIdent, quoteLiteral, RUN_ACTIONS, taskText, vacuumSql } from "./performance-actions";

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  statements: { byTotal: [], byMean: [{ shape: "select ? from big", calls: 50, total_ms: 9000, mean_ms: 180 }] },
  cache: { tableHit: 0.999, indexHit: 0.999 },
  largestTables: [],
  largestIndexes: [],
  seqScanHeavy: [{ name: "meals", seq_scan: 500, idx_scan: 10, rows: 80_000, seq_tup_read: 9_000_000 }],
  unusedIndexes: { count: 3, bytes: 3000 },
  unusedIndexList: [{ name: "meals_old_idx", table: "meals", bytes: 1000 }],
  duplicateIndexes: [{ table: "bills", keep: "bills_household_idx", drop: ["bills_household_idx2"] }],
  deadTuples: [{ name: "notifications", live: 40_000, dead: 20_000, dead_pct: 33 }],
  connections: { max: 60, reserved: 3, total: 10, active: 1, idle: 4, idleInTransaction: 2 },
  takenAt: "2026-10-29T10:00:00Z",
  ...over,
});

describe("quoting", () => {
  it("quotes identifiers and doubles embedded quotes", () => {
    expect(quoteIdent("meals")).toBe('"meals"');
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
    expect(quoteIdent("Mixed Case")).toBe('"Mixed Case"');
  });
  it("refuses names that cannot be written safely", () => {
    expect(quoteIdent("")).toBeNull();
    expect(quoteIdent("a\nb")).toBeNull();
    expect(quoteIdent("a\u0000b")).toBeNull();
    expect(quoteIdent("x".repeat(64))).toBeNull();
    expect(quoteIdent("é".repeat(32))).toBeNull(); // 64 bytes
  });
  it("quotes literals", () => {
    expect(quoteLiteral("o'brien")).toBe("'o''brien'");
    expect(quoteLiteral("a\nb")).toBeNull();
  });
});

describe("snippets", () => {
  const injection = 'x"; DROP TABLE households; --';

  it("keeps an injection attempt inside one quoted identifier", () => {
    const sql = dropIndexSql(injection)!;
    expect(sql).toContain('DROP INDEX CONCURRENTLY IF EXISTS "public"."x""; DROP TABLE households; --";');
    const statements = sql.split("\n").filter((l) => !l.startsWith("--"));
    expect(statements).toHaveLength(1);
    expect(vacuumSql(injection)).toContain('VACUUM (ANALYZE) "public"."x""; DROP TABLE households; --";');
  });
  it("keeps an injection attempt inside one string literal", () => {
    const sql = listIndexesSql("x' or '1'='1")!;
    expect(sql).toContain("tablename = 'x'' or ''1''=''1'");
  });
  it("produces nothing for an unquotable name or an empty list", () => {
    expect(dropIndexSql("a\nDROP TABLE x")).toBeNull();
    expect(vacuumSql("")).toBeNull();
    expect(dropIndexesSql([])).toBeNull();
    expect(dropIndexesSql(["fine", "bad\nname"])).toBeNull();
  });
  it("writes one statement per index, CONCURRENTLY and IF EXISTS, always in public", () => {
    const sql = dropIndexesSql(["a", "b"])!;
    expect(sql.match(/^DROP INDEX CONCURRENTLY IF EXISTS "public"\."[ab]";$/gm)).toHaveLength(2);
    expect(sql).toMatch(/Reviewed snippet/);
  });
});

describe("actionsFor", () => {
  const tips = computeTips({ snapshot: snapshot(), advisors: null, budgets: null });
  const byId = (id: string) => tips.find((t) => t.id === id || t.id.startsWith(id))!;

  it("a table read in full earns a statistics refresh for that table and a read-only index listing", () => {
    const actions = actionsFor(byId("seq-"), snapshot());
    expect(actions[0]).toMatchObject({ kind: "run", action: "analyze", target: "meals" });
    expect(actions[1]).toMatchObject({ kind: "copy" });
  });
  it("a slow query offers the reset; stuck connections offer ending them only when some exist", () => {
    expect(actionsFor(byId("stmt-"), snapshot())[0]).toMatchObject({ action: "reset_statements" });
    expect(actionsFor(byId("connections"), snapshot())[0]).toMatchObject({ action: "end_idle_sessions" });
    expect(actionsFor({ ...byId("connections"), id: "connections" }, snapshot({ connections: { max: 60, reserved: 3, total: 50, active: 1, idle: 49, idleInTransaction: 0 } }))).toEqual([]);
  });
  it("index and bloat findings never offer to run DDL: only a snippet to copy", () => {
    for (const id of ["unused-indexes", "duplicate-indexes", "dead-"]) {
      const actions = actionsFor(byId(id), snapshot());
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every((a) => a.kind === "copy")).toBe(true);
    }
    const vacuum = actionsFor(byId("dead-"), snapshot())[0];
    expect(vacuum).toMatchObject({ kind: "copy", sql: expect.stringContaining('VACUUM (ANALYZE) "public"."notifications";') });
  });
  it("owner-only actions need the reset capability and a password", () => {
    expect(RUN_ACTIONS.analyze).toMatchObject({ capability: "performance.maintain", stepUp: false });
    expect(RUN_ACTIONS.reset_statements).toMatchObject({ capability: "performance.reset", stepUp: true });
    expect(RUN_ACTIONS.end_idle_sessions).toMatchObject({ capability: "performance.reset", stepUp: true });
  });
  it("task text carries the story id", () => {
    expect(taskText(byId("unused-indexes"))).toMatch(/^\[PERF-14\]/);
  });
});
