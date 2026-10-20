import { describe, expect, it } from "vitest";

import { buildCart, pricePer, type PricedPurchase } from "./cart";

const bought = (itemId: string, over: Partial<PricedPurchase> = {}): PricedPurchase => ({
  itemId, quantity: 1, unit: "kg", unitCostMinor: 6000, currency: "INR", purchasedOn: "2026-10-12", merchant: "Fresh Mart", ...over,
});

describe("the cart's prices come only from recorded receipts", () => {
  it("prices a line by the last cost per unit times the amount on the list", () => {
    const cart = buildCart([{ itemId: "rice", name: "Rice", quantity: 2000, unit: "g" }], [bought("rice", { quantity: 1, unit: "kg", unitCostMinor: 6000 })]);
    expect(cart.lines[0]!.price).toMatchObject({ kind: "estimate", minor: 12000, currency: "INR" });
    expect(cart.totals).toEqual([{ currency: "INR", minor: 12000, lines: 1 }]);
    expect(pricePer(6, "g")).toEqual({ minor: 6000, per: "kg" });
  });

  it("uses the latest purchase, keeps decimals in minor units, and converts litres to millilitres", () => {
    const cart = buildCart(
      [{ itemId: "milk", name: "Milk", quantity: 1500, unit: "ml" }],
      [bought("milk", { unit: "l", quantity: 1, unitCostMinor: 5400, purchasedOn: "2026-10-01" }), bought("milk", { unit: "l", quantity: 2, unitCostMinor: 5650, purchasedOn: "2026-10-15" })],
    );
    expect(cart.lines[0]!.price).toMatchObject({ kind: "estimate", minor: 8475 });
  });

  it("says what was paid when the units do not convert, and leaves it out of the total", () => {
    const cart = buildCart([{ itemId: "eggs", name: "Eggs", quantity: 12, unit: "pcs" }], [bought("eggs", { unit: "tray", quantity: 1, unitCostMinor: 18000 })]);
    expect(cart.lines[0]!.price).toMatchObject({ kind: "last_paid", minor: 18000 });
    expect(cart.totals).toEqual([]);
    expect(cart.unpriced).toBe(1);
  });

  it("says a purchase with no unit on record only as what was paid", () => {
    const cart = buildCart([{ itemId: "atta", name: "Atta", quantity: 5000, unit: "g" }], [bought("atta", { unit: null, quantity: 5, unitCostMinor: 5000 })]);
    expect(cart.lines[0]!.price).toMatchObject({ kind: "last_paid", minor: 25000 });
  });

  it("never prices an item bought with no cost on record", () => {
    const cart = buildCart([{ itemId: "salt", name: "Salt", quantity: 1000, unit: "g" }, { itemId: "rice", name: "Rice", quantity: 1000, unit: "g" }], [bought("rice")]);
    expect(cart.lines[0]!.price).toEqual({ kind: "none" });
    expect(cart).toMatchObject({ priced: 1, unpriced: 1, totals: [{ currency: "INR", minor: 6000, lines: 1 }] });
  });
});

describe("Instamart stays off without a partner agreement", () => {
  it("is not configured from nothing, and its search link only carries the item's name", async () => {
    const { instamartFromEnv, instamartSearchUrl } = await import("./instamart");
    expect(instamartFromEnv({})).toBeNull();
    expect(instamartFromEnv({ SWIGGY_INSTAMART_PARTNER_KEY: "k", SWIGGY_INSTAMART_API_URL: "http://plain" })).toBeNull();
    expect(instamartFromEnv({ SWIGGY_INSTAMART_PARTNER_KEY: "k", SWIGGY_INSTAMART_API_URL: "https://partner.example" })).toEqual({ partnerKey: "k", apiUrl: "https://partner.example" });
    expect(instamartSearchUrl("Rice, Basmati")).toBe("https://www.swiggy.com/instamart/search?custom_back=true&query=Rice%2C%20Basmati");
  });
});
