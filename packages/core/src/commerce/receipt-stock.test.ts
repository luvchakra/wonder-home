import { describe, expect, it } from "vitest";

import type { GroceryItem } from "./inventory";
import { duplicateReceipt, receiptStockLine } from "./receipt-stock";

const item = (unit: string, stock: { quantity: number; unit: string; confirmedAt: string; source?: string } | null, toBuy: { quantity: number; unit: string } | null = null): GroceryItem => ({
  id: "milk", name: "Milk", category: "grocery", unit, step: null, lowLevel: null, storage: null, note: null, aliases: [], imageUrl: null, imagePath: null, catalog: null, lastPurchasedOn: null, updatedAt: "2026-09-20T00:00:00Z",
  stock: stock ? { source: "stated", ...stock, confirmedBy: null, version: 1, useBy: null, useByBasis: null } as GroceryItem["stock"] : null,
  toBuy: toBuy ? { entryId: "e-milk", ...toBuy, version: 1, source: "manual", mealId: null } : null,
});

describe("receiptStockLine", () => {
  it("adds what was bought to what is at home, in the item's unit", () => {
    const line = receiptStockLine({ quantity: 2, unit: "litre" }, item("l", { quantity: 500, unit: "ml", confirmedAt: "2026-10-10T08:00:00Z" }), "2026-10-17");
    expect(line).toMatchObject({ bought: { quantity: 2000, unit: "ml" }, before: { quantity: 500, unit: "ml" }, after: { quantity: 2500, unit: "ml" }, addByDefault: true });
  });

  it("starts stock at what was bought when nobody has said how much is at home", () => {
    expect(receiptStockLine({ quantity: 1, unit: "kg" }, item("kg", null), "2026-10-17")).toMatchObject({ before: null, after: { quantity: 1000, unit: "g" }, addByDefault: true });
  });

  it("does not add by default when someone counted the item after the receipt's day", () => {
    const line = receiptStockLine({ quantity: 1, unit: "l" }, item("l", { quantity: 1000, unit: "ml", confirmedAt: "2026-10-18T07:00:00Z" }), "2026-10-17");
    expect(line).toMatchObject({ countedAfter: "2026-10-18", addable: true, addByDefault: false });
  });

  it("a purchase, a receipt or an undo after the receipt's day is not somebody counting", () => {
    for (const source of ["purchase", "receipt", "undo"]) {
      const line = receiptStockLine({ quantity: 1, unit: "l" }, item("l", { quantity: 500, unit: "ml", confirmedAt: "2026-10-18T07:00:00Z", source }), "2026-10-17");
      expect(line, source).toMatchObject({ countedAfter: null, addByDefault: true });
    }
  });

  it("never converts across dimensions: a pack of an item kept in grams adds nothing", () => {
    const line = receiptStockLine({ quantity: 1, unit: "pack" }, item("g", { quantity: 200, unit: "g", confirmedAt: "2026-10-01T00:00:00Z" }), "2026-10-17");
    expect(line).toMatchObject({ bought: null, after: null, addable: false, addByDefault: false, clearable: false });
  });

  it("takes the bought amount off the list and leaves the rest to buy", () => {
    const line = receiptStockLine({ quantity: 1, unit: "l" }, item("l", null, { quantity: 2000, unit: "ml" }), "2026-10-17");
    expect(line).toMatchObject({ onList: { quantity: 2000, unit: "ml" }, listAfter: { quantity: 1000, unit: "ml" }, clearable: true });
  });

  it("an empty quantity is one, and an empty unit is the item's own", () => {
    expect(receiptStockLine({ quantity: null, unit: "" }, item("dozen", null), "2026-10-17").bought).toEqual({ quantity: 12, unit: "pcs" });
  });

  it("a new item starts at what was bought", () => {
    expect(receiptStockLine({ quantity: 3, unit: "pcs" }, null, "2026-10-17")).toMatchObject({ before: null, after: { quantity: 3, unit: "pcs" }, addByDefault: true, clearable: false });
  });
});

describe("duplicateReceipt", () => {
  const recorded = [{ id: "r1", merchant: "Nature's Basket ", purchasedOn: "2026-10-17", total: 842.5, recordedAt: "2026-10-17T12:00:00Z" }];

  it("is the same shop, the same day and the same total", () => {
    expect(duplicateReceipt({ id: "r2", merchant: "nature's  basket", purchasedOn: "2026-10-17", total: 842.5 }, recorded)?.id).toBe("r1");
  });

  it("is not a duplicate when any of the three differs or is unknown, or it is the same receipt", () => {
    expect(duplicateReceipt({ id: "r2", merchant: "Nature's Basket", purchasedOn: "2026-10-16", total: 842.5 }, recorded)).toBeNull();
    expect(duplicateReceipt({ id: "r2", merchant: "Nature's Basket", purchasedOn: "2026-10-17", total: 840 }, recorded)).toBeNull();
    expect(duplicateReceipt({ id: "r2", merchant: "Nature's Basket", purchasedOn: "2026-10-17", total: null }, recorded)).toBeNull();
    expect(duplicateReceipt({ id: "r1", merchant: "Nature's Basket", purchasedOn: "2026-10-17", total: 842.5 }, recorded)).toBeNull();
  });
});
