import type { SupabaseClient } from "@supabase/supabase-js";

import { householdItemForCatalog } from "../commerce/catalog-items";
import type { CatalogEntry } from "../commerce/catalog";
import { listGroceries } from "../commerce/inventory";
import type { IngredientLine } from "./ingredient-lines";

/**
 * A recipe's or a meal's ingredient rows, linked to the household's own
 * grocery items (25-017, the owner 2026-10-18: "these ingredients… should be
 * from the same grocery catalog that is used in HomeFood").
 *
 * - A row picked from the catalog becomes the household's item for that
 *   entry — the one already linked, or the same name, or a new item made
 *   from the entry (`householdItemForCatalog`, the rule Add item uses).
 * - A row picked from the household's own items is that item, once checked
 *   to be this household's.
 * - A typed row whose name is plainly one of the household's items is linked
 *   to it too; a genuinely new name stays as typed (rule 20: a picker always
 *   lets you add what isn't listed).
 *
 * So a meal's shortfall reads the pantry's own stock, and the shopping list
 * gets the item it already knows rather than a second copy by name. Each
 * line also brings its catalog entry back, for nutrients worked out from it.
 */
export async function linkIngredients(
  supabase: SupabaseClient,
  input: { householdId: string; lines: readonly IngredientLine[]; supabaseUrl: string },
): Promise<{ lines: IngredientLine[]; entries: Map<string, CatalogEntry> }> {
  const groceries = await listGroceries(supabase, input.householdId).catch(() => []);
  const byId = new Map(groceries.map((item) => [item.id, item]));
  const byName = new Map(groceries.flatMap((item) => [item.name, ...item.aliases].map((name) => [name.toLowerCase(), item] as const)));
  const entries = new Map<string, CatalogEntry>();
  const linked: IngredientLine[] = [];
  for (const line of input.lines) {
    const { ref, ...rest } = line;
    let consumableId: string | null = null;
    let name = rest.name;
    if (ref?.startsWith("catalog:")) {
      const found = await householdItemForCatalog(supabase, { householdId: input.householdId, catalogId: ref.slice(8), supabaseUrl: input.supabaseUrl, groceries }).catch(() => null);
      if (found) {
        consumableId = found.item.id;
        name = found.item.name;
        entries.set(found.item.id, found.entry);
      }
    } else if (ref?.startsWith("item:")) {
      const item = byId.get(ref.slice(5));
      if (item) {
        consumableId = item.id;
        name = item.name;
        if (item.catalog) entries.set(item.id, item.catalog);
      }
    }
    if (!consumableId) {
      const item = byName.get(rest.name.toLowerCase());
      if (item) {
        consumableId = item.id;
        if (item.catalog) entries.set(item.id, item.catalog);
      }
    }
    // Two rows that turned out to be the same item are one line.
    if (linked.some((earlier) => earlier.name.toLowerCase() === name.toLowerCase())) continue;
    linked.push({ ...rest, name, consumableId });
  }
  return { lines: linked, entries };
}
