import { describe, expect, it } from "vitest";

import { paymentsOverview, refundableAmount, staffRefund } from "./payments";

const untouched = new Proxy({}, { get: () => { throw new Error("must not touch the database"); } }) as never;

describe("what is left to refund", () => {
  it("subtracts refunds done or on their way, never failed ones", () => {
    expect(refundableAmount(299, [])).toBe(299);
    expect(refundableAmount(299, [{ amount: 100, status: "succeeded" }, { amount: 50, status: "processing" }])).toBe(149);
    expect(refundableAmount(299, [{ amount: 299, status: "failed" }])).toBe(299);
    expect(refundableAmount(10, [{ amount: 12, status: "succeeded" }])).toBe(0);
  });
});

describe("who may see and refund payments", () => {
  it("support staff can do neither, before anything is read", async () => {
    const support = { profileId: "s1", role: "support" as const };
    await expect(paymentsOverview(untouched, support)).rejects.toMatchObject({ code: "forbidden" });
    await expect(staffRefund(untouched, support, { paymentId: "p1", reasonCode: "duplicate" })).rejects.toMatchObject({ code: "forbidden" });
  });
});
