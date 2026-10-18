import type { SupabaseClient } from "@supabase/supabase-js";

import { similarity } from "../context/normalize";
import { getCatalogEntry, type CatalogEntry } from "./catalog";
import { listGroceries, type GroceryItem } from "./inventory";
import { createConsumable } from "./repository";

/**
 * The household's own item for a catalog entry (25-006, 25-017): the item
 * already linked to it, or plainly the same name — else a new item made from
 * the entry (name, category, unit, linked). One rule, shared by Groceries'
 * Add item and by a recipe's or a meal's ingredient rows, so an ingredient
 * picked from the catalog is the very item the shopping list and the pantry
 * already track, never a second copy under the same name.
 *
 * The entry is read again here; a browser only ever names its id.
 */
export async function householdItemForCatalog(
  supabase: SupabaseClient,
  input: { householdId: string; catalogId: string; supabaseUrl: string; groceries?: readonly GroceryItem[] },
): Promise<{ entry: CatalogEntry; item: { id: string; name: string; unit: string }; existing: GroceryItem | null; created: boolean } | null> {
  const entry = await getCatalogEntry(supabase, input.catalogId, input.supabaseUrl);
  if (!entry) return null;
  const groceries = input.groceries ?? (await listGroceries(supabase, input.householdId));
  const existing =
    groceries.find((item) => item.catalog?.id === entry.id || [item.name, ...item.aliases].some((known) => similarity(known, entry.name) >= 0.9)) ?? null;
  if (existing) return { entry, item: { id: existing.id, name: existing.name, unit: existing.unit }, existing, created: false };
  const { id } = await createConsumable(supabase, {
    householdId: input.householdId,
    name: entry.name,
    category: entry.category,
    unit: entry.unit,
    typicalQuantity: entry.pack?.quantity ?? 1,
    catalogId: entry.id,
  });
  return { entry, item: { id, name: entry.name, unit: entry.unit }, existing: null, created: true };
}
