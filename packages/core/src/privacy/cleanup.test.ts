import { describe, expect, it } from "vitest";

import { purgeSoftDeleted, runRetentionCleanup } from "./cleanup";

const DAY = 86_400_000;
const NOW = new Date("2026-10-28T00:00:00.000Z");
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();
const dayKey = (daysAgo: number) => iso(daysAgo).slice(0, 10);

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** A tiny in-memory Supabase fake supporting the chains cleanup.ts uses. */
function makeDb(tables: Tables) {
  function from(name: string) {
    const table = tables[name] ?? (tables[name] = []);
    const state: { mode: string; filters: [string, string, unknown][]; patch: Row | null; inserted: Row[] | null } = {
      mode: "select",
      filters: [],
      patch: null,
      inserted: null,
    };
    const match = (row: Row) =>
      state.filters.every(([op, col, val]) => {
        const cell = row[col];
        if (op === "eq") return cell === val;
        if (op === "is") return val === null ? cell === null || cell === undefined : cell === val;
        if (op === "lt") return cell != null && (cell as never) < (val as never);
        if (op === "in") return (val as unknown[]).includes(cell);
        if (op === "not-is") return val === null ? cell !== null && cell !== undefined : true;
        return true;
      });
    const run = () => {
      if (state.mode === "insert") {
        for (const r of state.inserted ?? []) table.push({ ...r });
        return { data: null, error: null };
      }
      if (state.mode === "update") {
        const hit = table.filter(match);
        for (const r of hit) Object.assign(r, state.patch);
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      if (state.mode === "delete") {
        const hit = table.filter(match);
        for (const r of hit) table.splice(table.indexOf(r), 1);
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      return { data: table.filter(match).map((r) => ({ ...r })), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (rows: Row | Row[]) => {
        state.mode = "insert";
        state.inserted = Array.isArray(rows) ? rows : [rows];
        return api;
      },
      update: (patch: Row) => {
        state.mode = "update";
        state.patch = patch;
        return api;
      },
      delete: () => {
        state.mode = "delete";
        return api;
      },
      eq: (col: string, val: unknown) => (state.filters.push(["eq", col, val]), api),
      is: (col: string, val: unknown) => (state.filters.push(["is", col, val]), api),
      lt: (col: string, val: unknown) => (state.filters.push(["lt", col, val]), api),
      in: (col: string, val: unknown) => (state.filters.push(["in", col, val]), api),
      not: (col: string, op: string, val: unknown) => (state.filters.push([`not-${op}`, col, val]), api),
      limit: () => api,
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        try {
          resolve(run());
        } catch (e) {
          reject(e);
        }
      },
    };
    return api;
  }
  return { from } as never;
}

const windowPolicy = (householdId: string, days: number | null): Row => ({
  household_id: householdId,
  category: "privacy",
  name: "Clean up passed entries after",
  active: true,
  rule: { days },
});

describe("runRetentionCleanup", () => {
  it("marks rows past the window, leaves recent ones, and audits counts only", async () => {
    const tables: Tables = {
      policies: [], // no window row → default 90 days
      availability_exceptions: [
        { id: "a-old", household_id: "h1", on_date: dayKey(200), soft_deleted_at: null },
        { id: "a-recent", household_id: "h1", on_date: dayKey(10), soft_deleted_at: null },
      ],
      family_event_changes: [
        { id: "c-old", household_id: "h1", created_at: iso(100), soft_deleted_at: null },
        { id: "c-recent", household_id: "h1", created_at: iso(30), soft_deleted_at: null },
      ],
      retention_cleanup_runs: [],
    };
    const summary = await runRetentionCleanup(makeDb(tables), NOW);

    expect(summary.marked).toBe(2);
    expect(tables.availability_exceptions!.find((r) => r.id === "a-old")!.soft_deleted_at).toBe(NOW.toISOString());
    expect(tables.availability_exceptions!.find((r) => r.id === "a-recent")!.soft_deleted_at).toBeNull();
    expect(tables.family_event_changes!.find((r) => r.id === "c-old")!.soft_deleted_at).toBe(NOW.toISOString());
    expect(tables.family_event_changes!.find((r) => r.id === "c-recent")!.soft_deleted_at).toBeNull();

    // Audit: counts, window and phase only — never an id or content.
    expect(tables.retention_cleanup_runs!).toHaveLength(2);
    for (const run of tables.retention_cleanup_runs!) {
      expect(run).toMatchObject({ household_id: "h1", phase: "soft_delete", affected: 1, window_days: 90 });
      expect(Object.keys(run)).not.toContain("id");
      expect(Object.keys(run)).not.toContain("title");
    }
  });

  it("is idempotent: a second run marks nothing new", async () => {
    const tables: Tables = {
      policies: [],
      availability_exceptions: [{ id: "a-old", household_id: "h1", on_date: dayKey(200), soft_deleted_at: null }],
      family_event_changes: [],
      retention_cleanup_runs: [],
    };
    const db = makeDb(tables);
    const first = await runRetentionCleanup(db, NOW);
    const second = await runRetentionCleanup(db, NOW);
    expect(first.marked).toBe(1);
    expect(second.marked).toBe(0);
    expect(tables.retention_cleanup_runs!).toHaveLength(1); // no new audit row on the empty run
  });

  it("respects the window boundary (just inside is kept, just outside is marked)", async () => {
    const tables: Tables = {
      policies: [],
      availability_exceptions: [
        { id: "inside", household_id: "h1", on_date: dayKey(89), soft_deleted_at: null },
        { id: "outside", household_id: "h1", on_date: dayKey(91), soft_deleted_at: null },
      ],
      family_event_changes: [],
      retention_cleanup_runs: [],
    };
    await runRetentionCleanup(makeDb(tables), NOW);
    expect(tables.availability_exceptions!.find((r) => r.id === "inside")!.soft_deleted_at).toBeNull();
    expect(tables.availability_exceptions!.find((r) => r.id === "outside")!.soft_deleted_at).toBe(NOW.toISOString());
  });

  it("skips a household that turned cleanup off", async () => {
    const tables: Tables = {
      policies: [windowPolicy("h-off", null)],
      availability_exceptions: [{ id: "a", household_id: "h-off", on_date: dayKey(500), soft_deleted_at: null }],
      family_event_changes: [],
      retention_cleanup_runs: [],
    };
    const summary = await runRetentionCleanup(makeDb(tables), NOW);
    expect(summary.marked).toBe(0);
    expect(tables.availability_exceptions![0]!.soft_deleted_at).toBeNull();
  });

  it("uses a shorter configured window", async () => {
    const tables: Tables = {
      policies: [windowPolicy("h1", 30)],
      availability_exceptions: [{ id: "a", household_id: "h1", on_date: dayKey(45), soft_deleted_at: null }],
      family_event_changes: [],
      retention_cleanup_runs: [],
    };
    await runRetentionCleanup(makeDb(tables), NOW);
    expect(tables.availability_exceptions![0]!.soft_deleted_at).toBe(NOW.toISOString());
  });

  it("skips the whole run when the windows cannot be read (fail-safe to keep)", async () => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      limit: async () => ({ data: null, error: { code: "boom" } }),
    });
    const db = { from: () => chain } as never;
    const summary = await runRetentionCleanup(db, NOW);
    expect(summary.skipped).toBe("windows_unreadable");
    expect(summary.marked).toBe(0);
  });
});

describe("purgeSoftDeleted", () => {
  it("no-ops while the purge is gated off", async () => {
    const tables: Tables = {
      availability_exceptions: [{ id: "a", household_id: "h1", on_date: dayKey(500), soft_deleted_at: iso(400) }],
      family_event_changes: [],
    };
    expect(await purgeSoftDeleted(makeDb(tables), NOW)).toEqual([]);
    expect(tables.availability_exceptions!).toHaveLength(1); // nothing deleted
  });

  it("hard-deletes soft-deleted rows past the grace window only when explicitly enabled", async () => {
    const tables: Tables = {
      availability_exceptions: [
        { id: "ripe", household_id: "h1", on_date: dayKey(500), soft_deleted_at: iso(100) },
        { id: "fresh", household_id: "h1", on_date: dayKey(500), soft_deleted_at: iso(10) },
        { id: "live", household_id: "h1", on_date: dayKey(500), soft_deleted_at: null },
      ],
      family_event_changes: [],
    };
    const outcomes = await purgeSoftDeleted(makeDb(tables), NOW, { enabled: true, graceDays: 30 });
    const ids = tables.availability_exceptions!.map((r) => r.id);
    expect(ids).toEqual(["fresh", "live"]); // only the ripe soft-deleted row is gone
    expect(outcomes.find((o) => o.category === "availability_exceptions")!.marked).toBe(1);
  });
});
