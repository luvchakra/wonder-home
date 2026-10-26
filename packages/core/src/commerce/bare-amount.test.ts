import { describe, expect, it } from "vitest";

import { bareExampleFor, bareExamples, bareRule, readBareNumber, type BareItem } from "./bare-amount";
import { ladderForItem } from "./buying-sizes";
import { readItemAmount } from "../conversation/quantity";

/** A catalog item as the seed has it: its unit, category and pack. */
const catalog = (name: string, unit: string, category: string, pack: { quantity: number; unit: string } | null, subcategory: string | null = null): BareItem => ({
  name,
  unit,
  catalog: { category, subcategory, pack, ladder: ladderForItem({ category, subcategory, name, unit }) },
});

const MILK = catalog("Milk, Toned", "ml", "Dairy", { quantity: 500, unit: "ml" });
const EGGS_DOZEN: BareItem = { name: "Eggs, Brown", unit: "dozen" };
const BREAD = catalog("Bread, White", "loaf", "Bakery", { quantity: 400, unit: "g" });
const RICE = catalog("Rice, Basmati", "kg", "Rice & grains", { quantity: 5, unit: "kg" });
const OIL = catalog("Sunflower oil", "l", "Oils & ghee", { quantity: 1, unit: "l" });
const PANEER = catalog("Paneer", "g", "Dairy", { quantity: 200, unit: "g" });
const BUTTER = catalog("Butter, Salted", "g", "Dairy", { quantity: 100, unit: "g" });
const TURMERIC = catalog("Turmeric powder", "g", "Spices & masalas", { quantity: 100, unit: "g" });
const BRINJAL = catalog("Baingan (brinjal)", "g", "Vegetables", { quantity: 500, unit: "g" });
const LEMON_BY_WEIGHT = catalog("Lemon (nimbu)", "g", "Fruits", { quantity: 250, unit: "g" });
const BUTTERMILK = catalog("Buttermilk (chaas)", "ml", "Dairy", { quantity: 200, unit: "ml" });

const read = (count: number, item: BareItem) => readBareNumber(count, item);

describe("a number said with no unit (25-037, the owner 2026-10-26)", () => {
  it.each([
    ["milk kept in ml: 2 is 2 L, never 2 ml", 2, MILK, { quantity: 2, unit: "l" }],
    ["eggs kept by the dozen: 2 is 2 pcs, never 2 dozen", 2, EGGS_DOZEN, { quantity: 2, unit: "pcs" }],
    ["eggs: 3 is 3 pcs", 3, { name: "Eggs", unit: "pcs" }, { quantity: 3, unit: "pcs" }],
    ["bread kept in loaves: 2 is 2 loaves", 2, BREAD, { quantity: 2, unit: "loaf" }],
    ["rice: 2 is 2 kg", 2, RICE, { quantity: 2, unit: "kg" }],
    ["oil: 1 is 1 L", 1, OIL, { quantity: 1, unit: "l" }],
    ["a vegetable kept in grams: 2 is 2 kg, never 2 g", 2, BRINJAL, { quantity: 2, unit: "kg" }],
    ["paneer: 2 is two 200 g packs", 2, PANEER, { quantity: 400, unit: "g" }],
    ["butter: 1 is one 100 g pack", 1, BUTTER, { quantity: 100, unit: "g" }],
    ["turmeric: 2 is two 100 g packs", 2, TURMERIC, { quantity: 200, unit: "g" }],
    ["paneer: 200 is plainly 200 g", 200, PANEER, { quantity: 200, unit: "g" }],
    ["buttermilk, sold in 200 ml packs: 3 is three packs", 3, BUTTERMILK, { quantity: 600, unit: "ml" }],
    ["a hand-made rice kept in grams: 2 is 2 kg", 2, { name: "Rice", unit: "g" }, { quantity: 2, unit: "kg" }],
    ["bananas kept by the dozen: 6 is 6 pcs", 6, { name: "Bananas", unit: "dozen" }, { quantity: 6, unit: "pcs" }],
  ])("%s", (_, count, item, expected) => {
    expect(read(count, item)).toEqual({ kind: "amount", amount: expected });
  });

  it("a number past anything bought at once is asked about once, never guessed", () => {
    expect(read(2000, MILK)).toEqual({ kind: "ask", meant: { quantity: 2000, unit: "ml" }, question: 'Did you mean 2 L of milk, toned? Say "yes", or tell me the amount with its unit, like "2 litres".' });
    expect(read(500, RICE)).toMatchObject({ kind: "ask", meant: { quantity: 500, unit: "g" }, question: expect.stringMatching(/^Did you mean 500 g of rice, basmati\?/) });
    expect(read(300, EGGS_DOZEN)).toMatchObject({ kind: "ask", meant: { quantity: 300, unit: "pcs" } });
  });

  it("a thing people count but the list keeps by weight is asked about — no weight is guessed for a lemon", () => {
    expect(read(2, LEMON_BY_WEIGHT)).toMatchObject({ kind: "ask", meant: null, question: expect.stringContaining('"500 g" or "1 kg"') });
    expect(bareRule({ name: "Lemons", unit: "pcs" }).kind).toBe("piece");
  });

  it("the examples a question gives read back as they say", () => {
    for (const item of [MILK, EGGS_DOZEN, BREAD, RICE, OIL, PANEER]) {
      const example = bareExampleFor(item.name, item);
      const said = readItemAmount(example);
      expect(said.item.toLowerCase()).toBe(item.name.toLowerCase());
      if (said.amount!.unit === null) {
        const meant = read(said.amount!.quantity, item);
        expect(meant.kind).toBe("amount");
      }
    }
    expect(bareExampleFor("Milk", MILK)).toBe("1 litre milk");
    expect(bareExampleFor("Eggs", EGGS_DOZEN)).toBe("6 eggs");
    expect(bareExampleFor("Bread", BREAD)).toBe("2 loaves bread");
    expect(bareExamples(MILK)).toBe("1 litre or 500 ml");
    expect(bareExamples(EGGS_DOZEN)).toBe("6 or a dozen");
    expect(bareExamples(PANEER)).toBe("200 g or 400 g");
  });
});
