import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { LIVE_DOMAINS, STORE_DOMAINS, storedItemsForViewer, withFacts } from "../homebrain/context-store";
import type { ContextViewer, HouseholdContextItem } from "../context/types";
import { FACT_TABLES, FACT_TABLE_NAMES, drainHousehold, drainKnowledge, factFor, factItem, factSelect, factsForTurn, type FactRow } from "./facts";
import { KNOWLEDGE_REGISTRY, REGISTRY_EXAMPLE_MEMBERS, type Row } from "./registry";

const HOUSEHOLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-10-27T06:30:00Z");
const CHILD = REGISTRY_EXAMPLE_MEMBERS.child;
const spec = (table: string) => FACT_TABLES.find((entry) => entry.table === table)!;
const context = { householdId: HOUSEHOLD, timezone: "Asia/Kolkata", now: NOW, names: new Map([[CHILD, "Asmi"]]) };

/**
 * An in-memory database with just enough of PostgREST for the worker: the
 * registered tables, the outbox (its trigger is what `write` does) and the
 * facts. The SQL itself is tested in `scripts/test-household-facts-rls.mjs`.
 */
function fakeDatabase() {
  const tables = new Map<string, Row[]>();
  const outbox = new Map<string, { household_id: string; source_table: string; source_id: string; token: string | null; rewritten: boolean }>();
  const facts = new Map<string, FactRow>();
  const factKey = (row: { household_id: string; source_table: string; source_id: string }) => `${row.household_id}|${row.source_table}|${row.source_id}`;
  let claims = 0;

  const write = (table: string, row: Row) => {
    const rows = (tables.get(table) ?? []).filter((existing) => existing.id !== row.id);
    tables.set(table, [...rows, row]);
    queue(table, row);
  };
  const remove = (table: string, id: string) => {
    const row = (tables.get(table) ?? []).find((existing) => existing.id === id);
    tables.set(table, (tables.get(table) ?? []).filter((existing) => existing.id !== id));
    if (row) queue(table, row);
  };
  const queue = (table: string, row: Row) => {
    const entry = { household_id: String(row.household_id), source_table: table, source_id: String(row.id) };
    const existing = outbox.get(factKey(entry));
    if (existing) existing.rewritten = true;
    else outbox.set(factKey(entry), { ...entry, token: null, rewritten: false });
  };

  type Filter = (row: Row) => boolean;
  const query = (table: string) => {
    const filters: Filter[] = [];
    let limit = Infinity;
    let mode: "select" | "delete" = "select";
    const source = (): Row[] => (table === "household_facts" ? ([...facts.values()] as unknown as Row[]) : table === "households" ? [{ id: HOUSEHOLD, timezone: "Asia/Kolkata" }] : table === "household_members" ? [{ id: CHILD, household_id: HOUSEHOLD, display_name: "Asmi" }] : (tables.get(table) ?? []));
    const run = () => {
      const rows = source().filter((row) => filters.every((filter) => filter(row))).slice(0, limit);
      if (mode === "delete") for (const row of rows) facts.delete(factKey(row as unknown as FactRow));
      return { data: rows, error: null };
    };
    const builder = {
      select: () => builder,
      delete: () => ((mode = "delete"), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value || (column === "id" && row.id === value)), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(String(row[column]))), builder),
      or: (expression: string) => {
        const at = expression.split("expires_at.gt.")[1]!;
        filters.push((row) => row.expires_at === null || String(row.expires_at) > at);
        return builder;
      },
      order: () => builder,
      limit: (n: number) => ((limit = n), builder),
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      upsert: async (rows: FactRow[]) => {
        for (const row of rows) facts.set(factKey(row), row);
        return { error: null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return builder;
  };

  const admin = {
    from: query,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_knowledge_outbox") {
        claims += 1;
        const claimed = [...outbox.values()].filter((entry) => entry.token === null && (args.p_household_id === null || entry.household_id === args.p_household_id)).slice(0, Number(args.p_limit));
        for (const entry of claimed) {
          entry.token = String(args.p_token);
          entry.rewritten = false;
        }
        return { data: claimed.map(({ household_id, source_table, source_id }) => ({ household_id, source_table, source_id })), error: null };
      }
      if (name === "finish_knowledge_outbox") {
        const failed = args.p_failed as { table: string; id: string }[];
        for (const [key, entry] of outbox) {
          if (entry.token !== args.p_token) continue;
          if (!entry.rewritten && !failed.some((f) => f.table === entry.source_table && f.id === entry.source_id)) outbox.delete(key);
          else entry.token = null;
        }
        return { error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  } as unknown as SupabaseClient;

  return { admin, write, remove, facts, outbox, claims: () => claims };
}

const teacher = (overrides: Row = {}): Row => ({ ...KNOWLEDGE_REGISTRY.school_teachers.example, id: "t-1", household_id: HOUSEHOLD, ...overrides });

describe("which tables become facts", () => {
  it("every registered table in a stored domain, and none read live for the person asking", () => {
    expect(FACT_TABLES.length).toBeGreaterThan(0);
    for (const entry of FACT_TABLES) {
      expect(STORE_DOMAINS).toContain(entry.domain);
      expect(LIVE_DOMAINS).not.toContain(entry.domain);
    }
    expect(FACT_TABLE_NAMES.has("health_record_readings")).toBe(false);
    expect(FACT_TABLE_NAMES.has("member_availability")).toBe(false);
  });

  it("reads what decides whether a record is still known, once", () => {
    for (const entry of FACT_TABLES) {
      const select = factSelect(entry);
      if (entry.activeOnly) expect(select).toMatch(/(^|[\s,])active([\s,]|$)/);
      if (entry.since) expect(select).toContain(entry.since.column);
      expect(select.split(",").map((part) => part.trim()).filter((part) => part === "active")).toHaveLength(entry.activeOnly ? 1 : 0);
    }
  });
});

describe("a record as its fact", () => {
  it("is the registry's own description, with its people, day and privacy", () => {
    const fact = factFor(spec("school_teachers"), teacher(), context)!;
    expect(fact.summary).toBe("Mrs Iyer is Asmi's class teacher.");
    expect(fact.subjects).toEqual([CHILD]);
    expect(fact.privacy).toBe("child");
    expect(fact.item.source).toEqual({ type: "school_teachers", sourceId: "t-1", capturedAt: null });
    expect(fact.expires_at).toBeNull();
  });

  it("is nothing for a record that is inactive, out of its window, or gone", () => {
    expect(factFor(spec("school_teachers"), teacher({ active: false }), context)).toBeNull();
    expect(factFor(spec("study_sessions"), { ...KNOWLEDGE_REGISTRY.study_sessions.example, starts_at: "2026-08-01T10:00:00Z" }, context)).toBeNull();
    expect(factFor(spec("school_teachers"), undefined, context)).toBeNull();
  });

  it("keeps its window's end, and reads as history once its day has passed", () => {
    const fact = factFor(spec("study_sessions"), KNOWLEDGE_REGISTRY.study_sessions.example, { ...context, now: new Date("2026-10-23T00:00:00Z") })!;
    expect(fact.expires_at).toBe("2026-11-23T11:30:00.000Z");
    expect(fact.day).toBe("2026-10-24");
    expect(factItem(fact, "2026-10-24").freshness).toBe("current");
    expect(factItem(fact, "2026-10-25")).toMatchObject({ freshness: "historical", tier: 3 });
  });
});

describe("facts written when records are written (14-037)", () => {
  it("a write yields a fact before the next turn", async () => {
    const db = fakeDatabase();
    db.write("school_teachers", teacher());
    const items = await factsForTurn(db.admin, { householdId: HOUSEHOLD, timezone: "Asia/Kolkata", now: NOW });
    expect(items).not.toBe("unavailable");
    expect((items as HouseholdContextItem[]).map((item) => item.summary)).toEqual(["Mrs Iyer is Asmi's class teacher."]);
    expect(db.outbox.size).toBe(0);
  });

  it("an edit replaces the fact, and a delete removes it", async () => {
    const db = fakeDatabase();
    db.write("school_teachers", teacher());
    await drainHousehold(db.admin, HOUSEHOLD);
    db.write("school_teachers", teacher({ name: "Mrs Rao" }));
    await drainHousehold(db.admin, HOUSEHOLD);
    expect([...db.facts.values()].map((fact) => fact.summary)).toEqual(["Mrs Rao is Asmi's class teacher."]);
    db.remove("school_teachers", "t-1");
    await drainHousehold(db.admin, HOUSEHOLD);
    expect(db.facts.size).toBe(0);
    db.write("school_teachers", teacher({ id: "t-2" }));
    db.write("school_teachers", teacher({ id: "t-2", active: false }));
    await drainHousehold(db.admin, HOUSEHOLD);
    expect(db.facts.size).toBe(0);
  });

  it("a turn drains only its own household's queue", async () => {
    const db = fakeDatabase();
    db.write("school_teachers", teacher());
    db.write("school_teachers", teacher({ id: "t-other", household_id: OTHER }));
    await factsForTurn(db.admin, { householdId: HOUSEHOLD, timezone: "Asia/Kolkata", now: NOW });
    expect([...db.outbox.values()].map((entry) => entry.household_id)).toEqual([OTHER]);
  });

  it("the delivery clock drains every household, and a gone household's queue just goes", async () => {
    const db = fakeDatabase();
    db.write("school_teachers", teacher());
    db.write("school_teachers", teacher({ id: "t-other", household_id: OTHER }));
    const result = await drainKnowledge(db.admin, { limit: 50, now: NOW });
    expect(result).toMatchObject({ claimed: 2, written: 1, failed: 0 });
    expect(db.outbox.size).toBe(0);
  });

  it("an empty queue costs one claim and writes nothing", async () => {
    const db = fakeDatabase();
    expect(await drainKnowledge(db.admin, { householdId: HOUSEHOLD, limit: 10 })).toEqual({ claimed: 0, written: 0, removed: 0, failed: 0 });
    expect(db.claims()).toBe(1);
  });

  it("no record index yet (the migration not applied) is 'unavailable', never an error", async () => {
    const missing = { code: "PGRST205", message: "not found" };
    const admin = {
      rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
      from: () => {
        const builder = { select: () => builder, eq: () => builder, or: () => builder, order: () => builder, limit: async () => ({ data: null, error: missing }) };
        return builder;
      },
    } as unknown as SupabaseClient;
    expect(await factsForTurn(admin, { householdId: HOUSEHOLD, timezone: "Asia/Kolkata", now: NOW })).toBe("unavailable");
  });
});

describe("facts in place of the store's own read of the same tables", () => {
  const item = (id: string, type: string, domain: HouseholdContextItem["domain"] = "school"): HouseholdContextItem =>
    ({ id, householdId: HOUSEHOLD, domain, entityType: type, entityId: id, subjectMemberIds: [CHILD], summary: id, need: "", attributes: {}, source: { type, sourceId: id, capturedAt: null }, evidence: [], confidence: 1, confirmed: true, privacyClass: "child", validFrom: null, validUntil: null, freshnessAt: NOW.toISOString(), freshness: "current", tier: 2, aliases: [], relatedEntityIds: [], authority: 3 }) as HouseholdContextItem;

  it("drops what the store read from a fact table and keeps everything else", () => {
    const stored = [item("old-teacher", "school_teachers"), item("homework", "school_items")];
    const merged = withFacts(stored, [item("teacher:t-1", "school_teachers")]);
    expect(merged.map((entry) => entry.id)).toEqual(["homework", "teacher:t-1"]);
    expect(withFacts(stored, "unavailable")).toEqual(stored);
  });

  it("are held to the viewer's own gates like any stored item", () => {
    // A member who does not manage school sees only their own school items.
    const child: ContextViewer = { memberId: "someone-else", permissions: ["school.view_own"], tone: "child", guardianOf: [] };
    const fact = factItem(factFor(spec("school_teachers"), teacher(), context)!, "2026-10-27");
    expect(storedItemsForViewer([fact], child, null)).toEqual([]);
    expect(storedItemsForViewer([fact], { ...child, memberId: CHILD }, null)).toHaveLength(1);
  });
});
