# Nutrients for chicken, mutton and prawn cuts (25-030)

*2026-10-21. The owner: "add nutrition data for chicken, mutton and prawns".*

## What was done
- **The gap.** Seven grocery-catalog items had no IFCT 2017 link, so the 25-029 dishes made from them showed no nutrients.
- **The links.** All seven were added to `supabase/seed/grocery-catalog/ifct-links.csv` as `close` matches, each with a note:

  | Item | IFCT code | Why |
  |---|---|---|
  | Chicken, Biryani cut | N002 | Thigh, the middle cut, as the skinless curry cut already was |
  | Chicken, Curry cut | N002 | Same |
  | Chicken, Keema | N002 | Same |
  | Chicken, Whole | N002 | Same |
  | Chicken, Boneless | N003 | Breast |
  | Mutton, Keema | O001 | Goat shoulder |
  | Prawns, Medium | Q007 | Brown tiger prawns (*Solenocera*), a medium marine prawn |

- **Not linked.** Mutton paya stays unlinked, because IFCT has no trotters.
- **Applied live.** `npm run catalog:ifct -- --apply` reported 7 links changed. `npx tsx scripts/recipe-catalog/seed.mts --apply` then rewrote all 60 recipes.

## Result, read back from the live `recipe_catalog`
- **Now with kcal and protein per serving (9):** keema paratha (430 kcal, 21 g), chicken curry (504, 36), kadai chicken (497, 36), chicken korma (534, 37), keema matar (364, 29), prawn masala (181, 20), chicken biryani (753, 35), chicken 65 (232, 29) and chicken seekh kebab (310, 24).
- **Still blank (4):** butter chicken, chicken tikka masala, Chettinad chicken and prawn pulao. Their meat now counts, but curd, butter, fresh cream, coconut milk, ginger-garlic paste and the masala blends have no data, so these dishes fall under the 80% weight coverage that `nutritionPerServing` needs. IFCT has none of those foods.

## Open
- **25-031.** A source for dairy, sugar and pastes. Reviewed `usda_foods` matches exist, but recipe nutrients read only IFCT or an item's own nutrients. Whether a reviewed USDA match may supply them is a decision to make first. 17 catalog dishes wait on it, including veg ones such as dal makhani, palak paneer, kheer and idli.

## Verified
- `npm run catalog:ifct` passed: 409 items linked (220 exact, 185 close, 4 approximate).
- The seed dry run listed the dishes above.
- A service-role read of the live catalog confirmed the figures.
- No code or schema changed. No QA data was created.
