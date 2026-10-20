import { describe, expect, it } from "vitest";

import { dietClash, dishDietOf, dishDietsFor, isDiet } from "./diet";

describe("what a dish is", () => {
  it("is the catalog's own label where there is one", () => {
    expect(dishDietOf({ catalogDiet: "egg", ingredients: ["rice"] })).toBe("egg");
  });

  it("is read from a household recipe's ingredients otherwise", () => {
    expect(dishDietOf({ ingredients: ["Chicken thighs", "onion"] })).toBe("non_veg");
    expect(dishDietOf({ ingredients: ["Eggs", "bread"] })).toBe("egg");
    expect(dishDietOf({ ingredients: ["Rajma", "tomato", "ghee"] })).toBe("veg");
    expect(dishDietOf({ ingredients: ["eggplant", "Eggless cake mix"] })).toBe("veg");
  });
});

describe("whether a dish fits a diet", () => {
  const rajma = { diet: "veg" as const, ingredients: ["rajma", "onion", "ghee"] };
  const omelette = { diet: "egg" as const, ingredients: ["eggs", "onion"] };
  const chicken = { diet: "non_veg" as const, ingredients: ["chicken", "curd"] };
  const poha = { diet: "veg" as const, ingredients: ["poha", "peanuts", "curry leaves"] };

  it("lets a non-vegetarian eat anything", () => {
    expect(dietClash("non_vegetarian", chicken)).toBeNull();
  });

  it("keeps meat from a vegetarian, and egg unless they eat egg", () => {
    expect(dietClash("vegetarian", chicken)).toBe("meat");
    expect(dietClash("vegetarian", omelette)).toBe("egg");
    expect(dietClash("eggetarian", omelette)).toBeNull();
    expect(dietClash("vegetarian", rajma)).toBeNull();
  });

  it("reads a vegan's and a Jain's dish down to its ingredients", () => {
    expect(dietClash("vegan", rajma)).toBe("dairy");
    expect(dietClash("vegan", poha)).toBeNull();
    expect(dietClash("vegan", { diet: "veg", ingredients: ["coconut milk", "peanut butter"] })).toBeNull();
    expect(dietClash("jain", rajma)).toBe("onion_garlic");
    expect(dietClash("jain", { diet: "veg", ingredients: ["aloo", "peas"] })).toBe("root");
    expect(dietClash("jain", poha)).toBeNull();
  });

  it("offers the labels a diet allows for a filter", () => {
    expect(dishDietsFor("eggetarian")).toEqual(["veg", "egg"]);
    expect(dishDietsFor("vegan")).toEqual(["veg"]);
    expect(isDiet("jain")).toBe(true);
    expect(isDiet("keto")).toBe(false);
  });
});
