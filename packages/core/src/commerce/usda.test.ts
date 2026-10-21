import { describe, expect, it } from "vitest";

import { usdaFoods, usdaLinks } from "./usda";

const food = [
  ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
  ["171284", "sr_legacy_food", "Yogurt, plain, whole milk", "1", "2019-04-01"],
  ["169655", "sr_legacy_food", "Sugars, granulated", "19", "2019-04-01"],
  ["173410", "sr_legacy_food", "Butter, salted", "1", "2019-04-01"],
];
const category = [["id", "code", "description"], ["1", "0100", "Dairy and Egg Products"], ["19", "1900", "Sweets"]];
const row = (fdc: string, nutrient: string, amount: string) => ["1", fdc, nutrient, amount, "", "", "", "", "", "", ""];
const foodNutrient = [
  ["id", "fdc_id", "nutrient_id", "amount", "data_points", "derivation_id", "min", "max", "median", "footnote", "min_year_acquired"],
  row("171284", "1008", "61"),
  row("171284", "1003", "3.47"),
  row("171284", "1004", "3.25"),
  row("171284", "1005", "4.66"),
  row("171284", "1087", "121"),
  row("171284", "1177", "7"),
  row("171284", "1051", "87.9"), // water: not a catalog key
  row("169655", "1008", "387"),
  row("169655", "1005", "99.98"),
  row("169655", "1079", ""), // blank: unknown
  row("173410", "1008", "717"),
];

describe("USDA SR Legacy as catalog nutrition", () => {
  it("reads only the foods asked for, per 100 g, under the catalog's keys", () => {
    const foods = usdaFoods({ food, category, foodNutrient }, new Set([171284, 169655]));
    expect(foods.map((entry) => entry.fdc_id)).toEqual([171284, 169655]);
    expect(foods[0]).toMatchObject({ description: "Yogurt, plain, whole milk", food_category: "Dairy and Egg Products", release: "SR Legacy 2018-04" });
    expect(foods[0]!.nutrients).toEqual({ energy_kcal: 61, protein_g: 3.47, fat_g: 3.25, carbohydrate_g: 4.66, calcium_mg: 121, folate_ug: 7 });
  });

  it("keeps a blank value unknown, never zero", () => {
    const [sugar] = usdaFoods({ food, category, foodNutrient }, new Set([169655]));
    expect(sugar!.nutrients).toEqual({ energy_kcal: 387, carbohydrate_g: 99.98 });
  });

  it("refuses a mapping that names an unknown food or a made-up match", () => {
    const { links, problems } = usdaLinks(
      [["slug", "fdc_id", "match_type", "note"], ["curd", "171284", "close", "Plain whole-milk curd"], ["sugar", "999", "exact", ""], ["butter-salted", "173410", "sort of", ""], ["curd", "171284", "exact", ""]],
      new Set([171284, 173410]),
    );
    expect(links).toEqual([{ slug: "curd", fdc_id: 171284, match_type: "close", note: "Plain whole-milk curd" }]);
    expect(problems).toHaveLength(3);
  });
});
