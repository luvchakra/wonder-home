import { describe, expect, it } from "vitest";

import { equalShares, splitAmount, validShares, yearByKind } from "./bill-split";

describe("splitting a bill (11-026)", () => {
  it("splits so the parts always add up to the bill exactly", () => {
    const thirds = equalShares(["a", "b", "c"]);
    expect(thirds.map((s) => s.basisPoints)).toEqual([3334, 3333, 3333]);
    const parts = splitAmount(100000, thirds);
    expect(parts.reduce((sum, p) => sum + p.minor, 0)).toBe(100000);
    expect(parts.map((p) => p.minor)).toEqual([33340, 33330, 33330]);
    const odd = splitAmount(1001, equalShares(["a", "b"]));
    expect(odd.map((p) => p.minor)).toEqual([501, 500]);
  });

  it("honours unequal shares", () => {
    expect(splitAmount(120050, [{ memberId: "a", basisPoints: 7000 }, { memberId: "b", basisPoints: 3000 }]).map((p) => p.minor)).toEqual([84035, 36015]);
  });

  it("accepts only two or more distinct adults whose shares make 100%", () => {
    expect(validShares(equalShares(["a", "b"]))).toBe(true);
    expect(validShares([{ memberId: "a", basisPoints: 10000 }])).toBe(false);
    expect(validShares([{ memberId: "a", basisPoints: 5000 }, { memberId: "a", basisPoints: 5000 }])).toBe(false);
    expect(validShares([{ memberId: "a", basisPoints: 6000 }, { memberId: "b", basisPoints: 3000 }])).toBe(false);
  });

  it("adds a year's payments by kind, never across currencies", () => {
    const rows = yearByKind(
      [
        { kind: "utility", amountMinor: 1000, currency: "INR", periodLabel: "2026-01" },
        { kind: "utility", amountMinor: 500, currency: "INR", periodLabel: "2026-02" },
        { kind: "rent", amountMinor: 9000, currency: "INR", periodLabel: "2026-02" },
        { kind: "utility", amountMinor: 40, currency: "USD", periodLabel: "2026-03" },
        { kind: "utility", amountMinor: 999, currency: "INR", periodLabel: "2025-12" },
      ],
      2026,
    );
    expect(rows).toEqual([
      { kind: "rent", currency: "INR", minor: 9000, payments: 1 },
      { kind: "utility", currency: "INR", minor: 1500, payments: 2 },
      { kind: "utility", currency: "USD", minor: 40, payments: 1 },
    ]);
  });
});
