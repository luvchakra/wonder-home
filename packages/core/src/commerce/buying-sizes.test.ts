import { describe, expect, it } from "vitest";

import { defaultLadder, ladderForItem, LADDERS, startAmount, stepAlong, uniformLadder } from "./buying-sizes";

const walk = (ladder: Parameters<typeof stepAlong>[0], from: number, steps: number, direction: 1 | -1) => {
  const seen: number[] = [];
  let at = from;
  for (let index = 0; index < steps; index += 1) seen.push((at = stepAlong(ladder, at, direction)));
  return seen;
};

describe("the amounts a household asks for", () => {
  it("counts eggs one at a time, never a dozen at a time", () => {
    const eggs = ladderForItem({ category: "Eggs", subcategory: "Eggs", name: "Eggs, White", unit: "dozen" });
    expect(eggs).toEqual({ unit: "pcs", sizes: [1] });
    expect(walk(eggs, 12, 3, 1)).toEqual([13, 14, 15]);
    expect(walk(eggs, 2, 2, -1)).toEqual([1, 0]);
    expect(defaultLadder("dozen")).toEqual({ unit: "pcs", sizes: [1] });
  });

  it("weighs loose vegetables the way a person says them", () => {
    const onion = ladderForItem({ category: "Vegetables", subcategory: "Everyday vegetables", name: "Onion", unit: "kg" });
    expect(walk(onion, 1000, 4, 1)).toEqual([1250, 1500, 1750, 2000]);
    expect(walk(onion, 500, 3, -1)).toEqual([250, 0, 0]);
  });

  it("steps atta linearly by the kilo, never 1.1 kg (the owner, 2026-10-20)", () => {
    const atta = ladderForItem({ category: "Atta & flours", subcategory: "Wheat atta", name: "Atta, whole wheat", unit: "kg" });
    expect(walk(atta, 0, 5, 1)).toEqual([1000, 2000, 3000, 4000, 5000]);
    // An amount said to HomeTalk moves to the step beside it.
    expect(stepAlong(atta, 1100, 1)).toBe(2000);
    expect(stepAlong(atta, 1100, -1)).toBe(1000);
    expect(stepAlong(atta, 15000, -1)).toBe(14000);
    const dal = ladderForItem({ category: "Dals & pulses", subcategory: null, name: "Toor dal", unit: "kg" });
    expect(walk(dal, 0, 4, 1)).toEqual([500, 1000, 1500, 2000]);
  });

  it("gives ginger and spices small packs, milk half litres, oil the bottles sold", () => {
    expect(ladderForItem({ category: "Vegetables", subcategory: "Everyday vegetables", name: "Ginger", unit: "g" }).sizes).toEqual([...LADDERS.small]);
    expect(ladderForItem({ category: "Spices & masalas", subcategory: "Ground spices", name: "Turmeric powder", unit: "g" }).sizes).toEqual([...LADDERS.spice]);
    expect(ladderForItem({ category: "Dairy", subcategory: "Milk", name: "Milk, Toned", unit: "ml" }).sizes).toEqual([...LADDERS.milk]);
    expect(ladderForItem({ category: "Oils & ghee", subcategory: "Edible oils", name: "Sunflower oil", unit: "l" }).sizes).toEqual([...LADDERS.oil]);
    expect(ladderForItem({ category: "Personal care", subcategory: "Oral care", name: "Toothpaste", unit: "pcs" })).toEqual({ unit: "pcs", sizes: [1] });
  });

  it("starts a first add at the usual buy, on the ladder", () => {
    const atta = ladderForItem({ category: "Atta & flours", subcategory: null, name: "Atta", unit: "kg" });
    expect(startAmount(atta, 5000)).toBe(5000);
    expect(startAmount(atta, 4000)).toBe(4000);
    expect(startAmount({ unit: "pcs", sizes: [1] }, 12)).toBe(12);
    expect(startAmount({ unit: "g", sizes: [70] }, null)).toBe(70);
  });

  it("keeps a household's own step when it set one", () => {
    expect(uniformLadder("kg", 0.5)).toEqual({ unit: "g", sizes: [500] });
    expect(walk(uniformLadder("kg", 0.5), 0, 3, 1)).toEqual([500, 1000, 1500]);
  });
});
