import { describe, expect, it } from "vitest";

import { markPaidProps } from "./mark-paid";

const t = (key: string) => key;

describe("markPaidProps", () => {
  it("offers today in the household's own timezone", () => {
    const now = new Date("2026-10-29T20:00:00.000Z");
    expect(markPaidProps(t as never, { householdId: "h", timezone: "Asia/Kolkata", currency: "INR", now }).today).toBe("2026-10-30");
    expect(markPaidProps(t as never, { householdId: "h", timezone: "America/New_York", currency: "USD", now }).today).toBe("2026-10-29");
  });

  it("keeps money decimal with the currency's own places", () => {
    expect(markPaidProps(t as never, { householdId: "h", timezone: "UTC", currency: "INR" }).exponent).toBe(2);
    expect(markPaidProps(t as never, { householdId: "h", timezone: "UTC", currency: "JPY" }).exponent).toBe(0);
  });

  it("reads every word from the bills.markPaid catalogue", () => {
    const { labels } = markPaidProps(t as never, { householdId: "h", timezone: "UTC", currency: "INR" });
    expect(Object.values(labels).every((value) => value.startsWith("bills.markPaid."))).toBe(true);
  });
});
