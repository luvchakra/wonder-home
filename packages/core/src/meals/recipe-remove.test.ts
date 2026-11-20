import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { recipePhotoPath, retireRecipe, setRecipeImage } from "./repository";

type Row = Record<string, unknown>;

/**
 * A recipes table that answers like Postgres behind row-level security: a
 * row the caller may not change is simply not matched (0 rows), and an
 * explicit refusal comes back as 42501.
 */
function fakeRecipes(rows: Row[], options: { refuse?: string; missingColumn?: boolean } = {}) {
  const updates: Row[] = [];
  const client = {
    from() {
      let filters: [string, unknown][] = [];
      let patch: Row | null = null;
      const matched = () => rows.filter((row) => filters.every(([column, value]) => row[column] === value));
      const query = {
        select: () => query,
        update: (values: Row) => ((patch = values), query),
        eq: (column: string, value: unknown) => ((filters = [...filters, [column, value]]), query),
        maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
        then: (resolve: (result: { data: Row[] | null; error: { code: string } | null }) => unknown) => {
          if (patch && options.missingColumn && "image_path" in patch) return resolve({ data: null, error: { code: "PGRST204" } });
          if (patch && options.refuse) return resolve({ data: null, error: { code: options.refuse } });
          const hit = matched();
          if (patch) for (const row of hit) (Object.assign(row, patch), updates.push({ id: row.id, ...patch }));
          return resolve({ data: hit.map((row) => ({ id: row.id })), error: null });
        },
      };
      return query;
    },
  };
  return { supabase: client as unknown as SupabaseClient, updates };
}

const HOME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const IDLI = "33333333-3333-4333-8333-333333333333";

describe("removing a household recipe (the card's cross, 25-050)", () => {
  it("retires it, never deletes it, and hands back its picture to remove", async () => {
    const { supabase, updates } = fakeRecipes([{ id: IDLI, household_id: HOME, active: true, image_path: recipePhotoPath(HOME, IDLI) }]);
    await expect(retireRecipe(supabase, { householdId: HOME, recipeId: IDLI })).resolves.toEqual({ imagePath: `${HOME}/recipes/${IDLI}` });
    expect(updates).toEqual([{ id: IDLI, active: false, image_path: null }]);
  });

  it("changes nothing in another household's recipes, and says the recipe is not here", async () => {
    const { supabase, updates } = fakeRecipes([{ id: IDLI, household_id: OTHER, active: true, image_path: null }]);
    await expect(retireRecipe(supabase, { householdId: HOME, recipeId: IDLI })).rejects.toMatchObject({ code: "not_found" });
    expect(updates).toEqual([]);
  });

  it("is refused in words when the database says this person may not change recipes", async () => {
    const { supabase } = fakeRecipes([{ id: IDLI, household_id: HOME, active: true, image_path: null }], { refuse: "42501" });
    await expect(retireRecipe(supabase, { householdId: HOME, recipeId: IDLI })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("a recipe's own picture (25-050)", () => {
  it("lives under the household's recipes folder", () => {
    expect(recipePhotoPath(HOME, IDLI)).toBe(`${HOME}/recipes/${IDLI}`);
  });

  it("is recorded, and reports false while the column's migration is not applied", async () => {
    const live = fakeRecipes([{ id: IDLI, household_id: HOME, image_path: null }]);
    await expect(setRecipeImage(live.supabase, { householdId: HOME, recipeId: IDLI, imagePath: recipePhotoPath(HOME, IDLI) })).resolves.toBe(true);
    const before = fakeRecipes([{ id: IDLI, household_id: HOME }], { missingColumn: true });
    await expect(setRecipeImage(before.supabase, { householdId: HOME, recipeId: IDLI, imagePath: recipePhotoPath(HOME, IDLI) })).resolves.toBe(false);
  });
});
