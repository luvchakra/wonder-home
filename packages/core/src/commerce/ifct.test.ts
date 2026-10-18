import { describe, expect, it } from "vitest";

import { ifctFoods, ifctLinks } from "./ifct";

const header = ["Food Code; code", "Food Name; name", "Scientific Name; scie", "Local Name; lang", "Food Group; grup", "Energy; enerc", "Protein; protcnt", "Total Fat; fatce", "Carbohydrate; choavldf", "Dietary Fiber; fibtg", "Sodium; na", "Iron; fe", "Folate; folsum"];

describe("IFCT 2017 as catalog nutrition", () => {
  it("turns grams into each nutrient's own unit and kJ into kcal", () => {
    const [dal] = ifctFoods([header, ["B021", "Red gram, dal", "Cajanus cajan", "H. Arhar dal", "Grain Legumes", "1385", "21.70", "1.56", "55.23", "9.06", "0.0175", "0.0039", "0.000106"]]);
    expect(dal).toMatchObject({ code: "B021", food_group: "Grain Legumes", energy_basis: "stated" });
    expect(dal!.nutrients).toEqual({ energy_kcal: 331, protein_g: 21.7, fat_g: 1.56, carbohydrate_g: 55.23, fibre_g: 9.06, sodium_mg: 17.5, iron_mg: 3.9, folate_ug: 106 });
  });

  it("computes energy where the table gives none or contradicts itself, and says so", () => {
    const [oil, chicken] = ifctFoods([header, ["T005", "Groundnut oil", "", "", "Edible Oils and Fats", "0", "0", "100", "0", "0", "", "", ""], ["N001", "Chicken, leg", "", "", "Poultry", "1605", "19.44", "12.64", "0", "0", "", "", ""]]);
    expect(oil).toMatchObject({ energy_basis: "computed" });
    expect(oil!.nutrients.energy_kcal).toBe(884);
    expect(chicken).toMatchObject({ energy_basis: "computed" });
    expect(chicken!.nutrients.energy_kcal).toBe(191);
  });

  it("keeps a blank value unknown, never zero", () => {
    const [food] = ifctFoods([header, ["D001", "Ash gourd", "", "", "Other Vegetables", "73", "0.79", "0.14", "2.84", "", "", "", ""]]);
    expect(food!.nutrients).not.toHaveProperty("fibre_g");
    expect(food!.nutrients).not.toHaveProperty("sodium_mg");
  });

  it("refuses a mapping that names an unknown food or a made-up match", () => {
    const { links, problems } = ifctLinks(
      [["slug", "ifct_code", "match_type", "note"], ["toor-dal", "B021", "exact", ""], ["paneer", "Z999", "exact", ""], ["onion", "D056", "sort of", ""]],
      new Set(["B021", "D056"]),
    );
    expect(links.map((link) => link.slug)).toEqual(["toor-dal"]);
    expect(problems).toHaveLength(2);
  });
});
