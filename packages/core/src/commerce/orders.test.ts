import { describe, expect, it } from "vitest";

import {
  canTransition,
  compareOffers,
  createFixtureCommerceConnector,
  idempotencyKeyFor,
  isLate,
  outcomeEffect,
  type Offer,
  type Order,
} from "./orders";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const order = (over: Partial<Order> = {}): Order => ({
  id: "order-1",
  provider: "bigbasket",
  status: "placed",
  totalMinor: 184_000,
  currency: "INR",
  placedAt: new Date("2026-09-16T09:00:00.000Z"),
  expectedAt: new Date("2026-09-18T09:00:00.000Z"),
  deliveredAt: null,
  idempotencyKey: "key",
  ...over,
});

const offer = (over: Partial<Offer> = {}): Offer => ({
  provider: "bigbasket",
  priceMinor: 18_000,
  currency: "INR",
  available: true,
  deliveryDays: 1,
  observedAt: new Date("2026-09-17T06:00:00.000Z"),
  ...over,
});

describe("an order's lifecycle", () => {
  it("allows the ordinary path", () => {
    expect(canTransition("draft", "pending_approval")).toBe(true);
    expect(canTransition("pending_approval", "placed")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });

  it("does not rewind a delivery", () => {
    // A wrong delivery is a return or a new order, not a rewind — otherwise the
    // history stops meaning anything.
    expect(canTransition("delivered", "shipped")).toBe(false);
    expect(canTransition("cancelled", "placed")).toBe(false);
  });
});

describe("what a status change does to a household outcome", () => {
  it("resolves what was waiting once it arrives", () => {
    expect(outcomeEffect("shipped", "delivered", order())).toMatchObject({ kind: "resolve" });
  });

  it("says nothing at all when nothing changed", () => {
    // This is the whole defence against duplicate notifications: a poll that
    // sees the same status again produces no effect.
    expect(outcomeEffect("shipped", "shipped", order())).toMatchObject({ kind: "none" });
  });

  it("replans on a firmer date rather than interrupting", () => {
    expect(outcomeEffect("placed", "shipped", order())).toMatchObject({ kind: "replan" });
  });

  it("escalates when the thing will not arrive, because only a person can decide", () => {
    expect(outcomeEffect("placed", "cancelled", order())).toMatchObject({ kind: "escalate" });
    expect(outcomeEffect("placed", "failed", order())).toMatchObject({ kind: "escalate" });
  });
});

describe("lateness", () => {
  it("ignores an hour or two, which is every courier", () => {
    const barely = order({ expectedAt: new Date("2026-09-17T06:00:00.000Z") });

    expect(isLate(barely, NOW)).toBe(false);
  });

  it("notices a day late", () => {
    const late = order({ expectedAt: new Date("2026-09-16T06:00:00.000Z") });

    expect(isLate(late, NOW)).toBe(true);
  });

  it("says nothing about an order that already arrived", () => {
    const done = order({ status: "delivered", expectedAt: new Date("2026-09-10T06:00:00.000Z") });

    expect(isLate(done, NOW)).toBe(false);
  });
});

describe("idempotency", () => {
  it("is the same for a retry of the same order", () => {
    const input = {
      householdId: "h",
      provider: "bigbasket",
      forDate: "2026-09-17",
      lineItems: [{ consumableId: "milk", description: "Milk", quantity: 2 }],
    };

    expect(idempotencyKeyFor(input)).toBe(idempotencyKeyFor(input));
  });

  it("does not depend on the order the lines happen to be in", () => {
    const base = { householdId: "h", provider: "bigbasket", forDate: "2026-09-17" };
    const one = idempotencyKeyFor({
      ...base,
      lineItems: [
        { consumableId: "milk", description: "Milk", quantity: 2 },
        { consumableId: "eggs", description: "Eggs", quantity: 12 },
      ],
    });
    const other = idempotencyKeyFor({
      ...base,
      lineItems: [
        { consumableId: "eggs", description: "Eggs", quantity: 12 },
        { consumableId: "milk", description: "Milk", quantity: 2 },
      ],
    });

    expect(one).toBe(other);
  });

  it("differs for the same basket on a different day", () => {
    const lineItems = [{ consumableId: "milk", description: "Milk", quantity: 2 }];

    expect(idempotencyKeyFor({ householdId: "h", provider: "b", forDate: "2026-09-17", lineItems })).not.toBe(
      idempotencyKeyFor({ householdId: "h", provider: "b", forDate: "2026-09-18", lineItems }),
    );
  });
});

describe("comparing merchants", () => {
  it("takes the cheapest that can actually deliver in time", () => {
    const comparison = compareOffers(
      [
        offer({ provider: "slow_but_cheap", priceMinor: 10_000, deliveryDays: 5 }),
        offer({ provider: "quick", priceMinor: 18_000, deliveryDays: 1 }),
      ],
      { neededInDays: 2, now: NOW },
    );

    expect(comparison.chosen?.provider).toBe("quick");
  });

  it("ignores a price nobody has checked lately", () => {
    // Quoting yesterday's price as today's is a small lie that shows up on a bill.
    const comparison = compareOffers([offer({ observedAt: new Date("2026-09-14T06:00:00.000Z") })], {
      now: NOW,
    });

    expect(comparison.chosen).toBeNull();
    expect(comparison.because).toContain("No recent prices");
  });

  it("says plainly when nobody has it", () => {
    const comparison = compareOffers([offer({ available: false })], { now: NOW });

    expect(comparison.chosen).toBeNull();
    expect(comparison.because).toContain("in stock");
  });

  it("says plainly when nobody can make the date", () => {
    const comparison = compareOffers([offer({ deliveryDays: 7 })], { neededInDays: 1, now: NOW });

    expect(comparison.chosen).toBeNull();
    expect(comparison.because).toContain("in time");
    expect(comparison.alternatives).toHaveLength(1);
  });

  it("explains the choice rather than just making it", () => {
    const comparison = compareOffers(
      [offer({ priceMinor: 18_000 }), offer({ provider: "other", priceMinor: 20_000 })],
      { now: NOW },
    );

    expect(comparison.because).toContain("Cheapest");
  });
});

describe("the fixture commerce connector", () => {
  it("does not claim to be live", () => {
    expect(createFixtureCommerceConnector({ provider: "bigbasket" }).live).toBe(false);
  });
});
