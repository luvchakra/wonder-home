/**
 * Diets (the owner, 2026-10-20: "veg, non veg, vegan, etc for preferences
 * for whole family as well as on member level").
 *
 * A diet is a food preference of kind `diet` whose subject is one of
 * `DIETS`: one for the whole household, and one for each person. Whether a
 * dish fits is decided here by rules, never by a model: a WonderHome catalog
 * dish carries its own label (veg, egg, non-veg), and a household's own
 * recipe is read from what it is made of. A vegan or Jain diet is checked
 * against the ingredients too, since "veg" alone does not say whether there
 * is ghee or onion in it. Pure.
 */

export const DIETS = ["vegetarian", "eggetarian", "non_vegetarian", "vegan", "jain"] as const;
export type Diet = (typeof DIETS)[number];

export function isDiet(value: unknown): value is Diet {
  return DIETS.includes(value as Diet);
}

/** What a dish is, as far as a diet cares: the catalog's label, or what its ingredients say. */
export type DishDiet = "veg" | "egg" | "non_veg";

/** Why a dish does not fit a diet, in closed words the screen puts in the reader's language. */
export const DIET_CLASHES = ["meat", "egg", "dairy", "honey", "onion_garlic", "root"] as const;
export type DietClash = (typeof DIET_CLASHES)[number];

const MEAT = /\b(?:chicken|mutton|lamb|goat|beef|pork|bacon|ham|sausage|salami|keema|fish|prawns?|shrimps?|crab|lobster|squid|tuna|salmon|anchov\w*|meat|gelatin)\b/i;
const EGG = /\beggs?\b|\banda\b/i;
const DAIRY = /\b(?:milk|ghee|butter|curd|dahi|yog(?:h)?urt|paneer|cheese|cream|khoya|mawa|malai|buttermilk|chaas|lassi|condensed milk|whey)\b/i;
const HONEY = /\bhoney\b/i;
/** Plant "milks" and "butters" are not dairy. */
const PLANT_DAIRY = /\b(?:coconut|almond|soy|soya|oat|rice|cashew|peanut|cocoa|nut)\s+(?:milk|butter|cream|curd|yog(?:h)?urt)\b/gi;
const ONION_GARLIC = /\b(?:onions?|garlic|shallots?|spring onions?|leeks?|chives)\b/i;
const ROOT = /\b(?:potato(?:es)?|aloo|carrots?|beetroot|beets?|radish|mooli|ginger|turnips?|sweet potato(?:es)?|yam|arbi|colocasia)\b/i;

/** A household recipe's diet, read from its ingredient names; the catalog's own label wins where there is one. */
export function dishDietOf(input: { catalogDiet?: DishDiet | null; ingredients: readonly string[] }): DishDiet {
  if (input.catalogDiet) return input.catalogDiet;
  const names = input.ingredients.join(" · ");
  if (MEAT.test(names)) return "non_veg";
  if (EGG.test(names)) return "egg";
  return "veg";
}

/** Whether a dish fits a diet, and if not, the first reason why. */
export function dietClash(diet: Diet, dish: { diet: DishDiet; ingredients: readonly string[] }): DietClash | null {
  if (diet === "non_vegetarian") return null;
  if (dish.diet === "non_veg") return "meat";
  if (dish.diet === "egg" && diet !== "eggetarian") return "egg";
  const names = dish.ingredients.join(" · ");
  if (diet === "vegan") {
    if (DAIRY.test(names.replace(PLANT_DAIRY, ""))) return "dairy";
    if (HONEY.test(names)) return "honey";
  }
  if (diet === "jain") {
    if (ONION_GARLIC.test(names)) return "onion_garlic";
    if (ROOT.test(names)) return "root";
  }
  return null;
}

/** Which dish labels a diet allows at a glance, for a filter: a vegan or Jain diet still needs `dietClash` on the ingredients. */
export function dishDietsFor(diet: Diet): DishDiet[] {
  return diet === "non_vegetarian" ? ["veg", "egg", "non_veg"] : diet === "eggetarian" ? ["veg", "egg"] : ["veg"];
}
