import type { SupabaseClient } from "@supabase/supabase-js";

import { catalogItemFor } from "../commerce/catalog";
import type { PendingClarification } from "../conversation/clarify";
import { suggestedAmounts, type SuggestedAmount } from "./choices";

/**
 * The practical amounts for the one item a quantity question is about, from
 * the catalog (`choices.ts` `suggestedAmounts`), keyed by lowercased name.
 * Empty when the question isn't about an amount, names several things, or
 * the catalog can't be read: the question still stands, with "Skip".
 */
export async function amountsFor(supabase: SupabaseClient, pending: PendingClarification | null | undefined): Promise<Record<string, SuggestedAmount[]>> {
  if (!pending) return {};
  const asked = pending.action === "complete_homesend_item"
    ? (pending.parameters.field === "quantity" && typeof pending.parameters.title === "string" ? [pending.parameters.title] : [])
    : pending.parameters.awaiting === "quantity" && Array.isArray(pending.parameters.quantityFor)
      ? (pending.parameters.quantityFor as unknown[]).filter((name): name is string => typeof name === "string")
      : [];
  if (asked.length !== 1) return {};
  const name = asked[0]!;
  const named = await catalogItemFor(supabase, name).catch(() => null);
  const amounts = suggestedAmounts(name, named);
  return amounts.length > 0 ? { [name.toLowerCase()]: amounts } : {};
}
