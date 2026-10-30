import { describe, expect, it } from "vitest";

import { groceryTabCounts } from "./inventory";

describe("groceryTabCounts", () => {
  it("counts all 35 items, the 27 on the list, and the ones at home", () => {
    const items = Array.from({ length: 35 }, (_, i) => ({
      stock: i < 10 ? { quantity: 2 } : i < 12 ? { quantity: 0 } : null,
      toBuy: i >= 8 && i < 35 ? { quantity: 1 } : null,
    }));
    expect(groceryTabCounts(items)).toEqual({ all: 35, inKitchen: 10, toBuy: 27 });
  });
  it("is zero for an empty list", () => {
    expect(groceryTabCounts([])).toEqual({ all: 0, inKitchen: 0, toBuy: 0 });
  });
});
