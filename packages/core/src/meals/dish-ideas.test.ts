import { describe, expect, it } from "vitest";

import { avoidedSubjects, checkDishIdeas, dishIdeaMessage, matchPantry, mentionsAvoided, type DishIdeaOutput, type PantryItem } from "./dish-ideas";

const PANTRY: PantryItem[] = [
  { id: "c-rice", name: "Basmati rice", status: "at_home" },
  { id: "c-tomato", name: "Tomato", status: "at_home" },
  { id: "c-onion", name: "Onion", aliases: ["pyaaz"], status: "at_home" },
  { id: "c-dal", name: "Toor dal", status: "kept" },
];

const idea = (name: string, ingredients: [string, boolean][], extra: Partial<DishIdeaOutput["ideas"][number]> = {}): DishIdeaOutput["ideas"][number] => ({
  name,
  cuisine: "Indian",
  totalMinutes: 30,
  serves: 4,
  method: "Cook it.",
  why: "Uses what is at home.",
  ingredients: ingredients.map(([ingredient, atHome]) => ({ name: ingredient, quantity: 200, unit: "grams", atHome })),
  ...extra,
});

describe("dish ideas from what is at home (25-018)", () => {
  it("lets the record, not the model, say what is at home", () => {
    const [kept] = checkDishIdeas({ ideas: [idea("Tomato rice", [["basmati rice", true], ["tomato", true], ["green peas", true]])] }, { pantry: PANTRY, avoid: [], existing: [] });
    expect(kept!.ingredients.map((ingredient) => [ingredient.name, ingredient.status, ingredient.consumableId])).toEqual([
      ["Basmati rice", "at_home", "c-rice"],
      ["Tomato", "at_home", "c-tomato"],
      // The model said green peas were at home; nothing on record says so.
      ["Green peas", "to_buy", null],
    ]);
    expect(kept!.ingredients[0]!.unit).toBe("g");
  });

  it("matches an item by its other names, and says a kept item is to be checked", () => {
    expect(matchPantry("pyaaz", PANTRY)?.id).toBe("c-onion");
    const [kept] = checkDishIdeas({ ideas: [idea("Dal tadka", [["toor dal", true], ["onion", true]])] }, { pantry: PANTRY, avoid: [], existing: [] });
    expect(kept!.ingredients[0]).toMatchObject({ name: "Toor dal", status: "kept", consumableId: "c-dal" });
  });

  it("drops a dish with anything the family avoids, in its name or an ingredient", () => {
    const output = { ideas: [idea("Peanut chikki", [["tomato", true]]), idea("Tomato rice", [["basmati rice", true], ["peanuts", false]]), idea("Onion tomato rice", [["onion", true], ["tomato", true]])] };
    expect(checkDishIdeas(output, { pantry: PANTRY, avoid: ["peanut"], existing: [] }).map((kept) => kept.name)).toEqual(["Onion tomato rice"]);
    expect(mentionsAvoided("Cashew nuts", ["nut"])).toBe(true);
    expect(mentionsAvoided("Coconut chutney", ["nut"])).toBe(false);
  });

  it("drops a dish mostly bought, a recipe already kept, a repeat, and keeps at most three", () => {
    const output = {
      ideas: [
        idea("Paneer tikka", [["paneer", false], ["capsicum", false], ["onion", true]]),
        idea("Tomato rice", [["basmati rice", true], ["tomato", true]]),
        idea("Jeera rice", [["basmati rice", true], ["onion", true]]),
        idea("Jeera rice", [["basmati rice", true]]),
        idea("Onion rice", [["basmati rice", true], ["onion", true]]),
        idea("Tomato onion salad", [["tomato", true], ["onion", true]]),
        idea("Rice kheer", [["basmati rice", true]]),
      ],
    };
    expect(checkDishIdeas(output, { pantry: PANTRY, avoid: [], existing: ["Tomato rice"] }).map((kept) => kept.name)).toEqual(["Jeera rice", "Onion rice", "Tomato onion salad"]);
  });

  it("keeps health to itself unless the household lets it reach the provider, and always enforces it", () => {
    const preferences = [
      { memberId: "m1", kind: "allergy" as const, subject: "Peanut", source: "member_stated" as const },
      { memberId: null, kind: "ethical" as const, subject: "Beef", source: "member_stated" as const },
      { memberId: "m2", kind: "preference" as const, subject: "Spicy", source: "member_stated" as const },
    ];
    expect(avoidedSubjects(preferences, { healthMayLeave: false })).toEqual({ enforce: ["Peanut", "Beef"], tell: ["Beef"] });
    expect(avoidedSubjects(preferences, { healthMayLeave: true }).tell).toEqual(["Peanut", "Beef"]);
  });

  it("tells the model only item names, what is avoided and the recipes already kept", () => {
    const message = dishIdeaMessage({ pantry: PANTRY, avoid: ["Beef"], slot: "dinner", serves: 4, existing: ["Tomato rice"] });
    expect(message).toContain("AT HOME:\n- Basmati rice\n- Tomato\n- Onion");
    expect(message).toContain("KEEP:\n- Toor dal");
    expect(message).toContain("AVOIDS:\n- Beef");
    expect(message).not.toContain("c-rice");
  });

  it("treats salt, oil and the everyday spices as basics to check, not to buy, and leaves them out of the share", () => {
    const [kept] = checkDishIdeas({ ideas: [idea("Onion rice", [["basmati rice", true], ["onion", true], ["salt", true], ["oil", false], ["turmeric", false], ["green peas", false]])] }, { pantry: PANTRY, avoid: [], existing: [] });
    expect(kept!.ingredients.map((ingredient) => ingredient.status)).toEqual(["at_home", "at_home", "kept", "kept", "kept", "to_buy"]);
    expect(checkDishIdeas({ ideas: [idea("Salted water", [["salt", true], ["water", true]])] }, { pantry: PANTRY, avoid: [], existing: [] })).toEqual([]);
  });

  it("says nothing when the model gave nothing", () => {
    expect(checkDishIdeas(null, { pantry: PANTRY, avoid: [], existing: [] })).toEqual([]);
  });
});
