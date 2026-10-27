import { describe, expect, it } from "vitest";

import { ApiError } from "../api/errors";
import {
  adjustListEntry,
  changeStock,
  itemStep,
  listGroceries,
  markBought,
  stockStatus,
} from "./inventory";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";

type Response = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/**
 * A stand-in client: every table query resolves to the item row (name and
 * unit) or an empty result, and `rpc` records what it was asked.
 */
function client(item: { name: string; unit: string } | null, rpc: Response) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const query = (result: Response) => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "in",
      "is",
      "order",
      "limit",
      "update",
      "gte",
    ])
      chain[method] = () => chain;
    chain.maybeSingle = () => Promise.resolve(result);
    chain.single = () =>
      Promise.resolve({
        data: { days_per_unit: null, evidence_basis: null },
        error: null,
      });
    chain.then = (resolve: (value: Response) => unknown) =>
      resolve({ data: [], error: null });
    return chain;
  };
  const supabase = {
    from: () => query({ data: item, error: null }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(rpc);
    },
  } as never;
  return { supabase, calls };
}

describe("stock status", () => {
  it("is unknown until somebody says how much there is", () => {
    expect(stockStatus({ stock: null, lowLevel: 5 })).toBe("unknown");
  });

  it("reads none, low and enough from the confirmed amount", () => {
    const stock = (quantity: number) => ({
      quantity,
      unit: "pcs",
      confirmedAt: "",
      confirmedBy: null,
      source: "stated",
      version: 1,
      useBy: null,
      useByBasis: null,
    });
    expect(stockStatus({ stock: stock(0), lowLevel: null })).toBe("none");
    expect(stockStatus({ stock: stock(4), lowLevel: 6 })).toBe("low");
    expect(stockStatus({ stock: stock(12), lowLevel: 6 })).toBe("enough");
    expect(stockStatus({ stock: stock(1), lowLevel: null })).toBe("enough");
  });

  it("steps an item by its own step, or its unit's usual one", () => {
    expect(itemStep({ unit: "kg", step: null })).toEqual({
      quantity: 500,
      unit: "g",
    });
    expect(itemStep({ unit: "l", step: 1 })).toEqual({
      quantity: 1000,
      unit: "ml",
    });
    expect(itemStep({ unit: "pcs", step: 6 })).toEqual({
      quantity: 6,
      unit: "pcs",
    });
  });
});

describe("changing the list", () => {
  it("sends the amount in the item's base unit", async () => {
    const { supabase, calls } = client(
      { name: "Rice", unit: "kg" },
      {
        data: { entryId: "e1", before: 0, after: 1500, unit: "g", version: 1 },
        error: null,
      },
    );
    const result = await adjustListEntry(supabase, {
      householdId: HOUSEHOLD,
      itemId: ITEM,
      kind: "add",
      amount: { quantity: 1.5, unit: "kg" },
      source: "manual",
      idempotencyKey: "key-00000001",
    });
    expect(calls[0]).toMatchObject({
      fn: "adjust_shopping_entry",
      args: {
        p_kind: "add",
        p_quantity: 1500,
        p_unit: "g",
        p_idempotency_key: "key-00000001",
      },
    });
    expect(result).toMatchObject({
      after: 1500,
      unit: "g",
      conflict: false,
      replayed: false,
    });
  });

  it("refuses a unit that does not convert, naming both", async () => {
    const { supabase, calls } = client(
      { name: "Rice", unit: "kg" },
      { data: null, error: null },
    );
    await expect(
      adjustListEntry(supabase, {
        householdId: HOUSEHOLD,
        itemId: ITEM,
        kind: "add",
        amount: { quantity: 1, unit: "l" },
        source: "manual",
        idempotencyKey: "key-00000002",
      }),
    ).rejects.toThrow(/Rice is kept in kg, and l does not convert/);
    expect(calls).toHaveLength(0);
  });

  it("removes without an amount, in the item's base unit", async () => {
    const { supabase, calls } = client(
      { name: "Milk", unit: "l" },
      {
        data: { entryId: "e1", before: 1000, after: 0, unit: "ml", version: 2 },
        error: null,
      },
    );
    await adjustListEntry(supabase, {
      householdId: HOUSEHOLD,
      itemId: ITEM,
      kind: "remove",
      source: "manual",
      idempotencyKey: "key-00000003",
    });
    expect(calls[0]!.args).toMatchObject({
      p_kind: "remove",
      p_quantity: 0,
      p_unit: "ml",
    });
  });

  it("says a helper cannot change it, in the database's words", async () => {
    const { supabase } = client(
      { name: "Milk", unit: "l" },
      {
        data: null,
        error: {
          code: "42501",
          message: "helpers read the list; the family changes it",
        },
      },
    );
    const attempt = adjustListEntry(supabase, {
      householdId: HOUSEHOLD,
      itemId: ITEM,
      kind: "add",
      amount: { quantity: 1, unit: "l" },
      source: "manual",
      idempotencyKey: "key-00000004",
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toThrow(/helpers read the list/);
  });

  it("refuses an item that is not this household's", async () => {
    const { supabase } = client(null, { data: null, error: null });
    await expect(
      adjustListEntry(supabase, {
        householdId: HOUSEHOLD,
        itemId: ITEM,
        kind: "add",
        amount: { quantity: 1, unit: "pcs" },
        source: "manual",
        idempotencyKey: "key-00000005",
      }),
    ).rejects.toThrow(/not on record/);
  });
});

describe("changing stock", () => {
  it("reports a stale version as a conflict, not a write", async () => {
    const { supabase } = client(
      { name: "Eggs", unit: "pcs" },
      {
        data: { conflict: true, version: 4, after: 10, unit: "pcs" },
        error: null,
      },
    );
    const result = await changeStock(supabase, {
      householdId: HOUSEHOLD,
      itemId: ITEM,
      kind: "set",
      amount: { quantity: 6, unit: "pcs" },
      source: "stated",
      idempotencyKey: "key-00000006",
      expectedVersion: 3,
    });
    expect(result).toMatchObject({ conflict: true, after: 10, version: 4 });
  });

  it("says when using more than there was stopped at nothing", async () => {
    const { supabase, calls } = client(
      { name: "Eggs", unit: "dozen" },
      {
        data: { before: 6, after: 0, unit: "pcs", version: 2, clamped: true },
        error: null,
      },
    );
    const result = await changeStock(supabase, {
      householdId: HOUSEHOLD,
      itemId: ITEM,
      kind: "use",
      amount: { quantity: 1, unit: "dozen" },
      source: "consumption",
      idempotencyKey: "key-00000007",
    });
    expect(calls[0]!.args).toMatchObject({
      p_kind: "use",
      p_quantity: 12,
      p_unit: "pcs",
    });
    expect(result.clamped).toBe(true);
  });
});

describe("marking bought", () => {
  it("records what was actually bought and reports what is left", async () => {
    const { supabase, calls } = client(
      { name: "Potatoes", unit: "kg" },
      {
        data: { remaining: 500, unit: "g", stockAfter: 2000, replayed: false },
        error: null,
      },
    );
    const result = await markBought(supabase, {
      householdId: HOUSEHOLD,
      entryId: "e1",
      itemId: ITEM,
      amount: { quantity: 2, unit: "kg" },
      purchasedOn: "2026-10-17",
      idempotencyKey: "key-00000008",
    });
    expect(calls[0]).toMatchObject({
      fn: "mark_bought",
      args: { p_quantity: 2000, p_entry_id: "e1" },
    });
    expect(result).toEqual({
      remaining: 500,
      unit: "g",
      stockAfter: 2000,
      replayed: false,
    });
  });
});

/** A consumables list query that resolves to the given rows (image_path null, so no storage call). */
function listClient(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
  (chain as { then: unknown }).then = (resolve: (value: Response) => unknown) =>
    resolve({ data: rows, error: null });
  return { from: () => chain } as never;
}

describe("listGroceries updatedAt (Recently updated sort)", () => {
  const row = (over: Record<string, unknown>) => ({
    id: ITEM, name: "Milk", category: "grocery", unit: "l", step: null, low_level: null,
    storage: null, note: null, aliases: [], image_path: null, last_purchased_on: null,
    grocery_catalog: null, inventory_balances: null, shopping_list_entries: [], ...over,
  });

  it("is the item's own updated_at when nothing else has changed", async () => {
    const [item] = await listGroceries(listClient([row({ updated_at: "2026-10-01T00:00:00Z" })]), HOUSEHOLD);
    expect(item?.updatedAt).toBe("2026-10-01T00:00:00Z");
  });

  it("is the stock's updated_at when the stock changed most recently", async () => {
    const [item] = await listGroceries(listClient([row({
      updated_at: "2026-10-01T00:00:00Z",
      inventory_balances: { quantity: 2, unit: "ml", confirmed_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-20T09:00:00Z", source: "stated", version: 1, use_by: null, use_by_basis: null },
    })]), HOUSEHOLD);
    expect(item?.updatedAt).toBe("2026-10-20T09:00:00Z");
  });

  it("is the open to-buy entry's updated_at when the list changed most recently", async () => {
    const [item] = await listGroceries(listClient([row({
      updated_at: "2026-10-01T00:00:00Z",
      inventory_balances: { quantity: 2, unit: "ml", confirmed_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-05T00:00:00Z", source: "stated", version: 1, use_by: null, use_by_basis: null },
      shopping_list_entries: [{ id: "e1", quantity: 1000, unit: "ml", updated_at: "2026-10-26T18:30:00Z", version: 1, source: "manual", meal_id: null, state: "to_buy" }],
    })]), HOUSEHOLD);
    expect(item?.updatedAt).toBe("2026-10-26T18:30:00Z");
  });
});
