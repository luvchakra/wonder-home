import { describe, expect, it } from "vitest";

import {
  describePurchase,
  evaluatePurchase,
  format,
  selectPolicy,
  type PurchasePolicy,
  type PurchaseRequest,
} from "./policy";

const policy = (over: Partial<PurchasePolicy> = {}): PurchasePolicy => ({
  scope: "any",
  scopeValue: null,
  autoApproveUnderMinor: 200_000,
  hardLimitMinor: 1_000_000,
  currency: "INR",
  active: true,
  ...over,
});

const request = (over: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  totalMinor: 184_000,
  currency: "INR",
  category: "grocery",
  merchant: "bigbasket",
  consumableIds: ["milk", "eggs"],
  ...over,
});

describe("choosing which policy applies", () => {
  it("prefers the narrowest match", () => {
    const chosen = selectPolicy(
      [
        policy(),
        policy({ scope: "category", scopeValue: "grocery" }),
        policy({ scope: "merchant", scopeValue: "bigbasket" }),
        policy({ scope: "consumable", scopeValue: "milk" }),
      ],
      request(),
    );

    expect(chosen?.scope).toBe("consumable");
  });

  it("ignores a policy that does not match", () => {
    const chosen = selectPolicy([policy({ scope: "merchant", scopeValue: "someone_else" })], request());

    expect(chosen).toBeNull();
  });

  it("ignores an inactive policy", () => {
    expect(selectPolicy([policy({ active: false })], request())).toBeNull();
  });
});

describe("whether a purchase may proceed", () => {
  it("allows a small one under the household's limit", () => {
    expect(evaluatePurchase([policy()], request())).toMatchObject({ outcome: "allow" });
  });

  it("asks a person above it", () => {
    expect(evaluatePurchase([policy()], request({ totalMinor: 500_000 }))).toMatchObject({
      outcome: "needs_approval",
    });
  });

  it("refuses above the ceiling, approval or not", () => {
    // The ceiling is what stops an approval prompt becoming a rubber stamp.
    expect(evaluatePurchase([policy()], request({ totalMinor: 2_000_000 }))).toMatchObject({
      outcome: "refuse",
      code: "over_hard_limit",
    });
  });

  it("asks a person when the household has never said anything", () => {
    // Silence is not consent, and reading it as consent is how a system loses
    // trust the first time it acts.
    expect(evaluatePurchase([], request())).toMatchObject({
      outcome: "needs_approval",
      reason: "This household has not said what WonderHome may buy on its own.",
    });
  });

  it("asks a person when the household approves everything", () => {
    expect(
      evaluatePurchase([policy({ autoApproveUnderMinor: null })], request({ totalMinor: 100 })),
    ).toMatchObject({ outcome: "needs_approval" });
  });

  it("refuses to compare amounts across currencies", () => {
    expect(evaluatePurchase([policy()], request({ currency: "USD" }))).toMatchObject({
      outcome: "refuse",
      code: "currency_mismatch",
    });
  });

  it("refuses an order that costs nothing", () => {
    expect(evaluatePurchase([policy()], request({ totalMinor: 0 }))).toMatchObject({
      outcome: "refuse",
      code: "not_positive",
    });
  });

  it("is deterministic — the same inputs give the same answer", () => {
    const policies = [policy(), policy({ scope: "category", scopeValue: "grocery", autoApproveUnderMinor: 50_000 })];

    const first = evaluatePurchase(policies, request());
    const second = evaluatePurchase(policies, request());
    expect(first).toEqual(second);
    // The narrower grocery policy wins, so this is above its lower limit.
    expect(first.outcome).toBe("needs_approval");
  });
});

describe("what the household is shown before anything is bought", () => {
  it("names the amount and the merchant, and what will happen", () => {
    const decision = evaluatePurchase([policy()], request());

    expect(describePurchase(request(), decision)).toContain("₹1,840");
    expect(describePurchase(request(), decision)).toContain("bigbasket");
  });

  it("says plainly when it needs approval", () => {
    const big = request({ totalMinor: 500_000 });

    expect(describePurchase(big, evaluatePurchase([policy()], big))).toContain("needs your approval");
  });

  it("formats money the way the household reads it", () => {
    expect(format(284_000, "INR")).toBe("₹2,840");
    expect(format(1050, "USD")).toBe("USD 10.5");
  });
});
