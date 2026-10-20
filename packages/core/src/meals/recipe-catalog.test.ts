import { describe, expect, it } from "vitest";

import { matchCatalogRecipe, methodFromSteps } from "./recipe-catalog";

const recipes = [
  { slug: "poha", name: "Kanda poha" },
  { slug: "dal-tadka", name: "Dal tadka" },
  { slug: "dal-makhani", name: "Dal makhani" },
  { slug: "aloo-gobi", name: "Aloo gobi" },
  { slug: "aloo-matar", name: "Aloo matar" },
];

describe("which catalog dish a name means", () => {
  it("matches a name or a slug, or the one dish holding every word", () => {
    expect(matchCatalogRecipe("poha", recipes)?.slug).toBe("poha");
    expect(matchCatalogRecipe("Kanda Poha", recipes)?.slug).toBe("poha");
    expect(matchCatalogRecipe("dal tadka", recipes)?.slug).toBe("dal-tadka");
    expect(matchCatalogRecipe("makhani", recipes)?.slug).toBe("dal-makhani");
  });

  it("never guesses between two that fit, or matches nothing", () => {
    expect(matchCatalogRecipe("dal", recipes)).toBeNull();
    expect(matchCatalogRecipe("aloo", recipes)).toBeNull();
    expect(matchCatalogRecipe("pizza", recipes)).toBeNull();
  });
});

describe("a dish's steps as a household recipe keeps them", () => {
  it("numbers each step on its own line", () => {
    expect(methodFromSteps(["Rinse the poha.", "Temper the spices."])).toBe("1. Rinse the poha.\n2. Temper the spices.");
  });
});
