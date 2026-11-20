import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api/audit", () => ({ auditChange: vi.fn(async () => undefined) }));
vi.mock("../context/invalidation", () => ({ invalidatesContext: <T>(fn: T) => fn }));

import { mayRemoveBills, removeBills } from "./remove-bills";

type Row = Record<string, unknown>;

/** Just enough of the client for these writes: eq / neq / in / is filters, update, select, head counts. */
function fakeClient(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let head = false;
    const run = () => {
      const hit = rows.filter((row) => filters.every((filter) => filter(row)));
      if (patch) for (const row of hit) Object.assign(row, patch);
      return hit;
    };
    const chain = {
      select(_columns?: string, options?: { head?: boolean }) {
        head = options?.head ?? false;
        return chain;
      },
      update(value: Row) {
        patch = value;
        return chain;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return chain;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return chain;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return chain;
      },
      is(column: string, value: unknown) {
        filters.push((row) => (row[column] ?? null) === value);
        return chain;
      },
      then<T>(resolve: (value: { data: Row[] | null; error: null; count: number }) => T) {
        const hit = run();
        return Promise.resolve({ data: head ? null : hit.map((row) => ({ ...row })), error: null, count: hit.length }).then(resolve);
      },
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const HOUSEHOLD = "h-1";
const ADMIN = { memberId: "m-admin", isAdmin: true };

function seed() {
  return {
    obligations: [
      { id: "b-4", household_id: HOUSEHOLD, name: "BESCOM electricity bill for October", status: "expected" },
      { id: "b-5", household_id: HOUSEHOLD, name: "Electricity bill", status: "expected" },
      { id: "b-paid", household_id: HOUSEHOLD, name: "Water", status: "paid" },
      { id: "b-other", household_id: "h-2", name: "Someone else's", status: "expected" },
    ],
    homesend_changes: [
      { id: "c-4", household_id: HOUSEHOLD, domain: "bill", entity_id: "b-4", intake_id: "i-mail", undone_at: null },
      { id: "c-5", household_id: HOUSEHOLD, domain: "bill", entity_id: "b-5", intake_id: "i-pdf", undone_at: null },
      { id: "c-5b", household_id: HOUSEHOLD, domain: "calendar", entity_id: "e-1", intake_id: "i-pdf", undone_at: null },
    ],
    home_send_items: [
      { id: "i-mail", household_id: HOUSEHOLD, status: "routed" },
      { id: "i-pdf", household_id: HOUSEHOLD, status: "routed" },
    ],
  } as Record<string, Row[]>;
}

describe("who may remove a bill", () => {
  it("an Admin may; anyone else is refused and nothing changes", async () => {
    expect(mayRemoveBills(ADMIN)).toBe(true);
    expect(mayRemoveBills({ memberId: "m-2", isAdmin: false })).toBe(false);
    const tables = seed();
    await expect(removeBills(fakeClient(tables), { householdId: HOUSEHOLD, ids: ["b-4"], actor: { memberId: "m-2", isAdmin: false } })).rejects.toThrow(/Admin/);
    expect(tables.obligations!.find((row) => row.id === "b-4")!.status).toBe("expected");
  });
});

describe("removing bills", () => {
  it("stands each down (never deleted), and only this household's", async () => {
    const tables = seed();
    const result = await removeBills(fakeClient(tables), { householdId: HOUSEHOLD, ids: ["b-4", "b-other", "b-4"], actor: ADMIN });
    expect(result.removed).toEqual(["b-4"]);
    expect(tables.obligations!.map((row) => [row.id, row.status])).toEqual([
      ["b-4", "cancelled"],
      ["b-5", "expected"],
      ["b-paid", "paid"],
      ["b-other", "expected"],
    ]);
  });

  it("a paid bill is removed from the list too; its row is kept, so its payments stay", async () => {
    const tables = seed();
    await removeBills(fakeClient(tables), { householdId: HOUSEHOLD, ids: ["b-paid"], actor: ADMIN });
    expect(tables.obligations!.find((row) => row.id === "b-paid")).toMatchObject({ status: "cancelled", name: "Water" });
  });

  it("a bill HomeSend added: its change is undone by this person, and an item with nothing left live is marked undone", async () => {
    const tables = seed();
    const result = await removeBills(fakeClient(tables), { householdId: HOUSEHOLD, ids: ["b-4", "b-5"], actor: ADMIN });
    expect(result.removed).toEqual(["b-4", "b-5"]);
    const changes = Object.fromEntries(tables.homesend_changes!.map((row) => [row.id, row]));
    expect(changes["c-4"]).toMatchObject({ undone_by_member_id: "m-admin" });
    expect(changes["c-4"]!.undone_at).toEqual(expect.any(String));
    expect(changes["c-5"]!.undone_at).toEqual(expect.any(String));
    // The PDF also added a calendar entry: that one is untouched, so the item stays as it was.
    expect(changes["c-5b"]!.undone_at).toBeNull();
    expect(result.releasedIntakes).toEqual(["i-mail"]);
    expect(tables.home_send_items).toEqual([
      { id: "i-mail", household_id: HOUSEHOLD, status: "undone" },
      { id: "i-pdf", household_id: HOUSEHOLD, status: "routed" },
    ]);
  });

  it("a bill already removed is left alone", async () => {
    const tables = seed();
    await removeBills(fakeClient(tables), { householdId: HOUSEHOLD, ids: ["b-4"], actor: ADMIN });
    const again = await removeBills(fakeClient(tables), { householdId: HOUSEHOLD, ids: ["b-4"], actor: ADMIN });
    expect(again).toEqual({ removed: [], releasedIntakes: [] });
  });
});
