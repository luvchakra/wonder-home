import { describe, expect, it } from "vitest";

import { totalsByCurrency } from "./totals";

describe("totals by currency", () => {
  it("never adds one currency to another", () => {
    expect(
      totalsByCurrency([
        { minor: 45000, currency: "INR" },
        { minor: 1250, currency: "USD" },
        { minor: 5000, currency: "INR" },
      ]),
    ).toEqual([
      { currency: "INR", minor: 50000, count: 2 },
      { currency: "USD", minor: 1250, count: 1 },
    ]);
  });

  it("skips anything without a price or a currency", () => {
    expect(totalsByCurrency([{ minor: null, currency: null }, { minor: 100, currency: null }, { minor: 200, currency: "SGD" }])).toEqual([
      { currency: "SGD", minor: 200, count: 1 },
    ]);
  });

  it("is empty when nothing is priced", () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});
