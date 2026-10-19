import type { SupabaseClient } from "@supabase/supabase-js";

import { listGroceries, stockStatus } from "../commerce/inventory";
import type { DishIdeaModel } from "../ai/dish-idea-model";
import { avoidedSubjects, checkDishIdeas, type DishIdea, type PantryItem } from "./dish-ideas";
import type { Preference } from "./meals";
import { listRecipeNames } from "./repository";

export type DishIdeasResult =
  | { status: "ideas"; ideas: DishIdea[] }
  /** Nothing is tracked as at home, so there is nothing to cook "from what is at home". */
  | { status: "nothing_at_home" }
  /** The model answered, but nothing it suggested passed the checks (or it did not answer). */
  | { status: "none" };

/**
 * Ideas for a meal from what is at home (25-018), read from the record and
 * checked by `checkDishIdeas`. Reads with the person's own session, so RLS
 * decides what is in it. Writes nothing: planning or saving an idea is a
 * separate step a person takes.
 */
export async function suggestDishIdeas(
  supabase: SupabaseClient,
  input: { householdId: string; slot: string; serves: number; model: DishIdeaModel; healthMayLeave: boolean },
): Promise<DishIdeasResult> {
  const [groceries, recipes, preferenceRows] = await Promise.all([
    listGroceries(supabase, input.householdId),
    listRecipeNames(supabase, input.householdId),
    supabase.from("food_preferences").select("member_id, kind, subject, source").eq("household_id", input.householdId),
  ]);

  const pantry: PantryItem[] = [];
  for (const item of groceries) {
    const status = stockStatus(item);
    if (status === "enough" || status === "low") pantry.push({ id: item.id, name: item.name, aliases: item.aliases, status: "at_home" });
    else if (status === "unknown") pantry.push({ id: item.id, name: item.name, aliases: item.aliases, status: "kept" });
  }
  if (!pantry.some((item) => item.status === "at_home") && pantry.length < 3) return { status: "nothing_at_home" };

  const preferences: Preference[] = ((preferenceRows.data ?? []) as Record<string, unknown>[]).map((row) => ({
    memberId: (row.member_id as string | null) ?? null,
    kind: row.kind as Preference["kind"],
    subject: row.subject as string,
    source: row.source as Preference["source"],
  }));
  const avoid = avoidedSubjects(preferences, { healthMayLeave: input.healthMayLeave });
  const existing = recipes.map((recipe) => recipe.name);

  const output = await input.model({ pantry, avoid: avoid.tell, slot: input.slot, serves: input.serves, existing });
  const ideas = checkDishIdeas(output, { pantry, avoid: avoid.enforce, existing });
  return ideas.length > 0 ? { status: "ideas", ideas } : { status: "none" };
}
