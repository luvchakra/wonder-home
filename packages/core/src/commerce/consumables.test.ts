import { describe, expect, it } from "vitest";

import {
  assessConsumable,
  expectedDepletion,
  inferRate,
  mayCreateShoppingAction,
  suggestPurchase,
  type Consumable,
} from "./consumables";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const consumable = (over: Partial<Consumable> = {}): Consumable => ({
  id: "milk",
  name: "Milk",
  category: "grocery",
  petId: null,
  unit: "litre",
  typicalQuantity: 2,
  daysPerUnit: 2,
  evidenceBasis: "purchase_history",
  lastPurchasedOn: "2026-09-14",
  lastPurchasedQuantity: 2,
  ...over,
});

describe("working out how fast something goes", () => {
  it("needs more than one interval before it will say anything", () => {
    // Two purchases is one gap, and one gap of a household's shopping says more
    // about the weekend than about the milk.
    expect(
      inferRate([
        { purchasedOn: "2026-09-01", quantity: 2 },
        { purchasedOn: "2026-09-05", quantity: 2 },
      ]),
    ).toBeNull();
  });

  it("averages the intervals once there are enough", () => {
    const rate = inferRate([
      { purchasedOn: "2026-09-01", quantity: 2 },
      { purchasedOn: "2026-09-05", quantity: 2 },
      { purchasedOn: "2026-09-09", quantity: 2 },
    ]);

    expect(rate).toEqual({ daysPerUnit: 2, basis: "purchase_history" });
  });

  it("ignores a same-day repeat, which is a correction rather than a cycle", () => {
    const rate = inferRate([
      { purchasedOn: "2026-09-01", quantity: 2 },
      { purchasedOn: "2026-09-01", quantity: 2 },
      { purchasedOn: "2026-09-05", quantity: 2 },
      { purchasedOn: "2026-09-09", quantity: 2 },
    ]);

    expect(rate?.daysPerUnit).toBe(2);
  });

  it("says nothing when the dates make no sense", () => {
    expect(
      inferRate([
        { purchasedOn: "not a date", quantity: 1 },
        { purchasedOn: "also not", quantity: 1 },
        { purchasedOn: "nope", quantity: 1 },
      ]),
    ).toBeNull();
  });
});

describe("when something runs out", () => {
  it("counts forward from the last purchase", () => {
    expect(expectedDepletion(consumable(), NOW)?.toISOString().slice(0, 10)).toBe("2026-09-18");
  });

  it("has no answer without a rate", () => {
    expect(expectedDepletion(consumable({ daysPerUnit: null, evidenceBasis: null }), NOW)).toBeNull();
  });

  it("has no answer without a last purchase", () => {
    expect(expectedDepletion(consumable({ lastPurchasedOn: null }), NOW)).toBeNull();
  });
});

describe("suggesting a purchase", () => {
  it("says why, and when it is needed by", () => {
    const suggestion = suggestPurchase(consumable(), NOW);

    expect(suggestion).toMatchObject({
      consumableId: "milk",
      quantity: 2,
      evidenceBasis: "purchase_history",
      neededBy: "2026-09-18",
    });
    expect(suggestion?.reason).toContain("Milk");
  });

  it("stays quiet about something that will last a while", () => {
    const plenty = consumable({ lastPurchasedOn: "2026-09-16", lastPurchasedQuantity: 10 });

    expect(suggestPurchase(plenty, NOW)).toBeNull();
  });

  it("gives medication more notice than milk", () => {
    const medicine = consumable({
      id: "med",
      name: "Inhaler refill",
      category: "medical",
      daysPerUnit: 30,
      typicalQuantity: 1,
      lastPurchasedQuantity: 1,
      lastPurchasedOn: "2026-08-24",
    });

    // Six days out: past the medical lead time, well inside a grocery's.
    expect(suggestPurchase(medicine, NOW)).not.toBeNull();
    expect(suggestPurchase({ ...medicine, category: "grocery" }, NOW)).toBeNull();
  });

  it("never suggests anything it cannot justify", () => {
    const unknown = consumable({ daysPerUnit: null, evidenceBasis: null });

    expect(suggestPurchase(unknown, NOW)).toBeNull();
  });
});

describe("whether a prediction may become a shopping action", () => {
  it("allows one that can cite its basis", () => {
    expect(mayCreateShoppingAction(consumable())).toMatchObject({ allowed: true });
  });

  it("refuses one with nothing behind it, and says so plainly", () => {
    const decision = mayCreateShoppingAction(consumable({ daysPerUnit: null, evidenceBasis: null }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("nothing behind this");
  });

  it("refuses when nothing is known about the last purchase", () => {
    expect(mayCreateShoppingAction(consumable({ lastPurchasedOn: null })).allowed).toBe(false);
  });
});

describe("the assessment other modules read", () => {
  it("is silent while there is plenty", () => {
    const plenty = consumable({ lastPurchasedOn: "2026-09-16", lastPurchasedQuantity: 10 });

    expect(assessConsumable(plenty, NOW).notable).toBe(false);
  });

  it("is silent, not speculative, when WonderHome has no idea", () => {
    const assessment = assessConsumable(consumable({ daysPerUnit: null, evidenceBasis: null }), NOW);

    expect(assessment.notable).toBe(false);
    expect(assessment.reason).toContain("does not know how fast");
  });

  it("treats having run out as blocking", () => {
    const empty = consumable({ lastPurchasedOn: "2026-09-01" });
    const assessment = assessConsumable(empty, NOW);

    expect(assessment.status).toBe("blocked");
    expect(assessment.action).toEqual({ action: "add_to_cart", target: "milk" });
  });

  it("scopes a pet supply to the same model without special-casing it", () => {
    const petFood = consumable({ id: "cat-food", name: "Cat food", category: "pet", petId: "mochi" });

    expect(assessConsumable(petFood, NOW).notable).toBe(true);
  });
});
