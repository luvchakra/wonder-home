import { describe, expect, it } from "vitest";

import { platformCan, type PlatformAdmin } from "./admin";
import { SUBSCRIPTION_ADMIN_REASON_CODES, adminChangePlan } from "./subscriptions";

/**
 * Subscription administration (story 16-005).
 *
 * `adminChangePlan` delegates the actual mechanics to `changePlan`, which is
 * already exercised end to end against real Postgres by
 * `scripts/test-entitlements-rls.mjs`. What belongs here is the one thing
 * that is this module's own: the capability gate has to refuse *before*
 * anything reaches the database, for a role that should never be able to
 * move a household's money.
 */

const support: PlatformAdmin = { profileId: "p-1", role: "support" };
const operator: PlatformAdmin = { profileId: "p-2", role: "operator" };
const owner: PlatformAdmin = { profileId: "p-3", role: "owner" };

/** Throws if ever touched — proves the guard runs before any query. */
const untouchableClient = new Proxy(
  {},
  {
    get() {
      throw new Error("adminChangePlan reached the database despite a role that should have been refused");
    },
  },
) as never;

describe("who may change a household's plan from the platform side", () => {
  it("refuses support, which cannot manage billing", async () => {
    await expect(
      adminChangePlan(untouchableClient, support, {
        householdId: "h-1",
        toPlanKey: "pro",
        reasonCode: "billing_dispute",
      }),
    ).rejects.toThrowError(/cannot change a household's plan/);
  });

  it("grants operator and owner the capability the guard checks", () => {
    // Reaching the database from there is proven by the DB-level suite; the
    // point here is that `adminChangePlan`'s own guard would let them through.
    expect(platformCan(operator, "subscription.manage")).toBe(true);
    expect(platformCan(owner, "subscription.manage")).toBe(true);
    expect(platformCan(support, "subscription.manage")).toBe(false);
  });
});

describe("reason codes", () => {
  it("are a fixed, reviewable set rather than free text", () => {
    expect(SUBSCRIPTION_ADMIN_REASON_CODES).toEqual([
      "household_requested",
      "billing_dispute",
      "plan_correction",
      "fraud_review",
      "goodwill_adjustment",
    ]);
  });
});
