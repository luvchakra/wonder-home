import { describe, expect, it } from "vitest";

import type { ProviderRecord } from "../integrations/connector";
import {
  canPlace,
  mayPlaceOrder,
  planOrderSync,
  translateCommerce,
  type ExistingOrder,
  type TranslatedOrderUpdate,
} from "./commerce-connector";
import { createFixtureCommerceConnector, type CommercePayload, type OrderStatus } from "./orders";

/**
 * The commerce connector (story 17-005).
 *
 * Commerce is the first connector reporting on something the household
 * created, with money already committed to it. So most of what is asserted
 * here is what a merchant is *not* allowed to do to canonical state.
 */

function record(payload: Partial<CommercePayload> = {}): ProviderRecord<CommercePayload> {
  return {
    externalId: payload.externalOrderId ?? "ord-1",
    contentHash: "provider-hash",
    type: "order",
    observedAt: new Date("2026-09-19T10:00:00.000Z"),
    payload: { externalOrderId: "ord-1", status: "confirmed", ...payload },
  };
}

function order(overrides: Partial<ExistingOrder> = {}): ExistingOrder {
  return {
    id: "row-1",
    externalId: "ord-1",
    status: "placed",
    totalMinor: 284_000,
    currency: "INR",
    ...overrides,
  };
}

function update(overrides: Partial<TranslatedOrderUpdate> = {}): TranslatedOrderUpdate {
  return {
    externalId: "ord-1",
    status: "confirmed",
    totalMinor: null,
    currency: null,
    expectedAt: null,
    contentHash: "hash-1",
    ...overrides,
  };
}

describe("translating what a merchant sent", () => {
  it("carries the identity, status and expected date", () => {
    const { updates } = translateCommerce([
      record({ status: "shipped", expectedAt: "2026-09-21T09:00:00.000Z" }),
    ]);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ externalId: "ord-1", status: "shipped" });
    expect(updates[0]!.expectedAt?.toISOString()).toBe("2026-09-21T09:00:00.000Z");
  });

  it("treats an absent total as absent, not as zero", () => {
    // Zero would read as a free order and could overwrite a real amount.
    expect(translateCommerce([record()]).updates[0]!.totalMinor).toBeNull();
  });

  it("skips a record that does not say which order it is about, and says why", () => {
    const { updates, skipped } = translateCommerce([record({ externalOrderId: "" })]);
    expect(updates).toHaveLength(0);
    expect(skipped[0]!.because).toContain("which order");
  });

  it("ignores an unparseable expected date rather than storing one", () => {
    expect(translateCommerce([record({ expectedAt: "next tuesday" })]).updates[0]!.expectedAt).toBeNull();
  });

  it("gives the same payload the same hash, and a changed one a different hash", () => {
    const first = translateCommerce([record({ status: "shipped" })]).updates[0]!;
    const same = translateCommerce([record({ status: "shipped" })]).updates[0]!;
    const changed = translateCommerce([record({ status: "delivered" })]).updates[0]!;

    expect(first.contentHash).toBe(same.contentHash);
    expect(first.contentHash).not.toBe(changed.contentHash);
  });
});

describe("a merchant cannot rewind an order", () => {
  it("refuses to un-deliver a delivered order", () => {
    // Providers replay queues and resend stale webhooks. A reconciler that
    // took the newest message as the newest truth would eventually do this.
    const plan = planOrderSync(
      [order({ status: "delivered" })],
      new Set(),
      [update({ status: "shipped" })],
    );

    expect(plan.apply).toHaveLength(0);
    expect(plan.refused[0]).toMatchObject({ from: "delivered", to: "shipped" });
    expect(plan.refused[0]!.because).toContain("return, not a rewind");
  });

  it("refuses to reopen a cancelled or failed order", () => {
    for (const status of ["cancelled", "failed"] as OrderStatus[]) {
      const plan = planOrderSync([order({ status })], new Set(), [update({ status: "shipped" })]);
      expect(plan.refused, status).toHaveLength(1);
      expect(plan.refused[0]!.because).toContain(status);
    }
  });

  it("allows the transitions an order really makes", () => {
    for (const [from, to] of [
      ["placed", "confirmed"],
      ["confirmed", "shipped"],
      ["shipped", "delivered"],
      ["placed", "cancelled"],
    ] as [OrderStatus, OrderStatus][]) {
      const plan = planOrderSync([order({ status: from })], new Set(), [update({ status: to })]);
      expect(plan.apply, `${from} → ${to}`).toHaveLength(1);
    }
  });
});

describe("a merchant cannot quietly reprice", () => {
  it("flags a total that no longer matches what was agreed", () => {
    const plan = planOrderSync([order({ totalMinor: 284_000 })], new Set(), [
      update({ totalMinor: 842_000, currency: "INR" }),
    ]);

    expect(plan.repriced[0]).toEqual({
      externalId: "ord-1",
      approvedMinor: 284_000,
      reportedMinor: 842_000,
      currency: "INR",
    });
  });

  it("flags it even when the status change itself is ordinary", () => {
    // The status move may well be real and worth applying. What must not
    // happen is the new amount arriving unremarked alongside it.
    const plan = planOrderSync([order({ status: "placed" })], new Set(), [
      update({ status: "confirmed", totalMinor: 999_999 }),
    ]);

    expect(plan.apply).toHaveLength(1);
    expect(plan.repriced).toHaveLength(1);
  });

  it("does not flag a total that matches", () => {
    const plan = planOrderSync([order()], new Set(), [update({ totalMinor: 284_000 })]);
    expect(plan.repriced).toHaveLength(0);
  });

  it("does not compare across currencies", () => {
    // ₹2,840 and $2,840 are not a reprice, they are a bug somewhere else, and
    // reporting them as a price change would send somebody looking in the
    // wrong place.
    const plan = planOrderSync([order({ currency: "INR" })], new Set(), [
      update({ totalMinor: 284_000, currency: "USD" }),
    ]);

    expect(plan.repriced).toHaveLength(0);
  });
});

describe("an order WonderHome did not place", () => {
  it("is reported as unmatched, never inserted", () => {
    // Somebody ordering in the merchant's own app. It has no approval behind
    // it, and inventing one would put a purchase nobody agreed to in the
    // household's history.
    const plan = planOrderSync([], new Set(), [update({ externalId: "ord-elsewhere" })]);

    expect(plan.unmatched).toHaveLength(1);
    expect(plan.apply).toHaveLength(0);
  });
});

describe("a re-sync does not repeat work", () => {
  it("counts an already-seen payload as unchanged", () => {
    const seen = new Set(["ord-1:hash-1"]);
    const plan = planOrderSync([order()], seen, [update({ contentHash: "hash-1" })]);

    expect(plan.unchanged).toBe(1);
    expect(plan.apply).toHaveLength(0);
  });

  it("applies the same status again when the content changed", () => {
    // The expected date moved: the ordinary case, and the one a household most
    // wants to hear about.
    const plan = planOrderSync([order({ status: "shipped" })], new Set(), [
      update({ status: "shipped", expectedAt: new Date("2026-09-25T00:00:00.000Z") }),
    ]);

    expect(plan.apply).toHaveLength(1);
  });
});

describe("placing an order", () => {
  const fixture = createFixtureCommerceConnector({ provider: "fixture", records: [] });

  it("refuses when nothing has been priced", () => {
    expect(
      mayPlaceOrder({ connector: fixture, previewed: null, approved: true, totalMinor: 100 }),
    ).toMatchObject({ mayPlace: false, code: "not_previewed" });
  });

  it("refuses what the household's rules refuse", () => {
    expect(
      mayPlaceOrder({
        connector: fixture,
        previewed: { outcome: "refuse", totalMinor: 100 },
        approved: true,
        totalMinor: 100,
      }),
    ).toMatchObject({ mayPlace: false, code: "not_approved" });
  });

  it("waits for a person when the policy said to ask", () => {
    expect(
      mayPlaceOrder({
        connector: fixture,
        previewed: { outcome: "needs_approval", totalMinor: 100 },
        approved: false,
        totalMinor: 100,
      }),
    ).toMatchObject({ mayPlace: false, code: "not_approved" });
  });

  it("refuses a price that changed after it was shown", () => {
    // An order repriced between the preview and the click is a different
    // order, and the household agreed to the other one.
    expect(
      mayPlaceOrder({
        connector: fixture,
        previewed: { outcome: "allow", totalMinor: 284_000 },
        approved: true,
        totalMinor: 842_000,
      }),
    ).toMatchObject({ mayPlace: false, code: "amount_changed" });
  });

  it("refuses when no merchant is configured", () => {
    const check = mayPlaceOrder({
      connector: null,
      previewed: { outcome: "allow", totalMinor: 100 },
      approved: true,
      totalMinor: 100,
    });

    expect(check).toMatchObject({ mayPlace: false, code: "provider_not_live" });
    if (check.mayPlace) return;
    expect(check.reason).toContain("integration tests");
  });

  it("refuses a connector that can follow orders but not place them", () => {
    // A read-only adapter is a legal thing to write, and the safer default
    // for one somebody is still building.
    expect(canPlace(fixture)).toBe(false);
    expect(
      mayPlaceOrder({
        connector: fixture,
        previewed: { outcome: "allow", totalMinor: 100 },
        approved: true,
        totalMinor: 100,
      }),
    ).toMatchObject({ mayPlace: false, code: "provider_cannot_place" });
  });

  it("allows an approved order at the price it was approved at, to a merchant that can place", () => {
    const placing = Object.assign(
      createFixtureCommerceConnector({ provider: "fixture", records: [] }),
      { place: async () => ({ placed: false as const, code: "fixture", reason: "Fixture." }) },
    );

    expect(canPlace(placing)).toBe(true);
    expect(
      mayPlaceOrder({
        connector: placing,
        previewed: { outcome: "needs_approval", totalMinor: 284_000 },
        approved: true,
        totalMinor: 284_000,
      }),
    ).toEqual({ mayPlace: true });
  });
});
