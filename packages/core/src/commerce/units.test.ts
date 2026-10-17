import { describe, expect, it } from "vitest";

import {
  addAmounts,
  compatible,
  convert,
  defaultStep,
  displayAmount,
  formatAmount,
  normalizeUnit,
  parseQuantity,
  stepInBase,
  subtractAmounts,
  toBase,
  unitInfo,
} from "./units";

describe("normalizeUnit", () => {
  it("reads the spellings households and receipts use", () => {
    expect(normalizeUnit("Litre")).toBe("l");
    expect(normalizeUnit("KGs")).toBe("kg");
    expect(normalizeUnit("gm")).toBe("g");
    expect(normalizeUnit("item")).toBe("pcs");
    expect(normalizeUnit("unit")).toBe("pcs");
    expect(normalizeUnit("Bunches")).toBe("bunch");
    expect(normalizeUnit("ltr.")).toBe("l");
  });

  it("keeps a household's own word as a unit of its own", () => {
    expect(normalizeUnit(" Sachet ")).toBe("sachet");
    expect(unitInfo("sachet")).toEqual({
      key: "sachet",
      dimension: "each",
      base: "sachet",
      factor: 1,
    });
  });

  it("returns null for nothing", () => {
    expect(normalizeUnit("  ")).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe("conversion", () => {
  it("converts within a dimension and refuses across one", () => {
    expect(convert(1.5, "kg", "g")).toBe(1500);
    expect(convert(250, "ml", "l")).toBe(0.25);
    expect(convert(2, "dozen", "pcs")).toBe(24);
    expect(convert(1, "kg", "l")).toBeNull();
    expect(convert(1, "bunch", "pcs")).toBeNull();
    expect(compatible("pack", "pack")).toBe(true);
    expect(compatible("pack", "box")).toBe(false);
  });

  it("round-trips every amount through its base unit", () => {
    const units = ["g", "kg", "ml", "l", "pcs", "dozen"];
    for (const unit of units) {
      for (let quantity = 0; quantity <= 20; quantity += 0.125) {
        const base = toBase(quantity, unit);
        expect(convert(base.quantity, base.unit, unit)).toBeCloseTo(
          quantity,
          3,
        );
      }
    }
  });
});

describe("arithmetic", () => {
  it("adds compatible amounts in the first amount's base unit", () => {
    expect(
      addAmounts({ quantity: 1, unit: "kg" }, { quantity: 500, unit: "g" }),
    ).toEqual({ quantity: 1500, unit: "g" });
    expect(
      addAmounts({ quantity: 6, unit: "pcs" }, { quantity: 1, unit: "dozen" }),
    ).toEqual({ quantity: 18, unit: "pcs" });
    expect(
      addAmounts({ quantity: 1, unit: "kg" }, { quantity: 1, unit: "l" }),
    ).toBeNull();
  });

  it("never goes below zero, and says when it stopped there", () => {
    expect(
      subtractAmounts(
        { quantity: 10, unit: "pcs" },
        { quantity: 2, unit: "pcs" },
      ),
    ).toEqual({ quantity: 8, unit: "pcs", clamped: false });
    expect(
      subtractAmounts(
        { quantity: 10, unit: "pcs" },
        { quantity: 20, unit: "pcs" },
      ),
    ).toEqual({ quantity: 0, unit: "pcs", clamped: true });
    expect(
      subtractAmounts({ quantity: 1, unit: "l" }, { quantity: 1, unit: "l" }),
    ).toEqual({ quantity: 0, unit: "ml", clamped: false });
  });

  it("does not drift with repeated decimal steps", () => {
    let amount = { quantity: 0, unit: "kg" };
    for (let index = 0; index < 10; index += 1)
      amount = addAmounts(amount, { quantity: 0.1, unit: "kg" })!;
    expect(amount).toEqual({ quantity: 1000, unit: "g" });
    for (let index = 0; index < 10; index += 1)
      amount = subtractAmounts(amount, { quantity: 0.1, unit: "kg" })!;
    expect(amount.quantity).toBe(0);
  });

  it("is order-independent for any sequence of additions", () => {
    const steps = [
      { quantity: 0.25, unit: "kg" },
      { quantity: 125, unit: "g" },
      { quantity: 1, unit: "kg" },
      { quantity: 0.001, unit: "kg" },
    ];
    const forward = steps.reduce<{ quantity: number; unit: string }>(
      (sum, step) => addAmounts(sum, step)!,
      { quantity: 0, unit: "g" },
    );
    const backward = [...steps]
      .reverse()
      .reduce<{
        quantity: number;
        unit: string;
      }>((sum, step) => addAmounts(sum, step)!, { quantity: 0, unit: "g" });
    expect(forward).toEqual(backward);
  });
});

describe("steps and display", () => {
  it("steps by what the unit is bought in", () => {
    expect(defaultStep("g")).toBe(100);
    expect(defaultStep("kg")).toBe(0.5);
    expect(defaultStep("ml")).toBe(250);
    expect(defaultStep("pcs")).toBe(1);
    expect(defaultStep("bunch")).toBe(1);
    expect(stepInBase("kg", null)).toEqual({ quantity: 500, unit: "g" });
    expect(stepInBase("kg", 0.25)).toEqual({ quantity: 250, unit: "g" });
    expect(stepInBase("dozen", null)).toEqual({ quantity: 12, unit: "pcs" });
  });

  it("shows an amount the way a person would say it", () => {
    expect(displayAmount({ quantity: 1500, unit: "g" })).toEqual({
      quantity: 1.5,
      unit: "kg",
    });
    expect(displayAmount({ quantity: 500, unit: "g" })).toEqual({
      quantity: 500,
      unit: "g",
    });
    expect(displayAmount({ quantity: 1000, unit: "ml" })).toEqual({
      quantity: 1,
      unit: "l",
    });
    expect(displayAmount({ quantity: 1, unit: "dozen" })).toEqual({
      quantity: 12,
      unit: "pcs",
    });
    expect(formatAmount({ quantity: 1500, unit: "g" }, "en-IN")).toBe("1.5 kg");
    expect(formatAmount({ quantity: 1000, unit: "ml" }, "en-IN")).toBe("1 L");
    expect(
      formatAmount({ quantity: 6, unit: "pcs" }, "en-IN", (unit, quantity) =>
        quantity === 1 ? "pc" : unit,
      ),
    ).toBe("6 pcs");
    expect(formatAmount({ quantity: 1500, unit: "g" }, "de-DE")).toBe("1,5 kg");
  });

  it("reads what someone typed into an amount", () => {
    expect(parseQuantity("1.5")).toBe(1.5);
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseQuantity("-2")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
  });
});
