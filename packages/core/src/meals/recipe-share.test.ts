import { describe, expect, it } from "vitest";

import { methodSteps, recipeShareText, type RecipeShareWords } from "./recipe-share";

const words: RecipeShareWords = {
  timeServes: "{minutes} min · serves {serves}",
  perServing: "{kcal} kcal · {protein}g protein per serving",
  kcalOnly: "{kcal} kcal per serving",
  needs: "What you need",
  optional: "Optional",
  steps: "How to make it",
  closing: "Shared from WonderHome",
  unitName: (unit) => (unit === "bunch" ? "bunch" : unit),
  number: (value) => String(value),
};

describe("recipeShareText", () => {
  it("says the whole recipe: heading, time, nutrition, what you need, steps, closing", () => {
    const text = recipeShareText(
      {
        name: "Aloo paratha",
        totalMinutes: 40,
        serves: 4,
        caloriesPerServing: 374,
        proteinGrams: 10,
        method: "Boil the potatoes.\nMash with spices.\n3. Stuff and roll.",
        essentials: [
          { name: "Atta", quantity: 300, unit: "g" },
          { name: "Coriander", quantity: 0.5, unit: "bunch" },
          { name: "Salt", quantity: 1, unit: "unit" },
        ],
        optional: ["Butter"],
      },
      words,
    );
    expect(text).toBe(
      [
        "🍽️ Aloo paratha",
        "40 min · serves 4",
        "374 kcal · 10g protein per serving",
        "",
        "What you need:",
        "• Atta — 300 g",
        "• Coriander — 0.5 bunch",
        "• Salt",
        "Optional: Butter",
        "",
        "How to make it:",
        "1. Boil the potatoes.",
        "2. Mash with spices.",
        "3. Stuff and roll.",
        "",
        "Shared from WonderHome",
      ].join("\n"),
    );
  });

  it("leaves out what was never recorded", () => {
    const text = recipeShareText({ name: "Idli", totalMinutes: 25, serves: 4, essentials: [], optional: [] }, words);
    expect(text).toBe(["🍽️ Idli", "25 min · serves 4", "", "Shared from WonderHome"].join("\n"));
  });
});

describe("methodSteps", () => {
  it("splits one paragraph into sentences", () => {
    expect(methodSteps("Soak the rice. Grind it fine. Steam 12 minutes.")).toEqual(["Soak the rice.", "Grind it fine.", "Steam 12 minutes."]);
  });
  it("is empty when there is no method", () => {
    expect(methodSteps(null)).toEqual([]);
  });
});
