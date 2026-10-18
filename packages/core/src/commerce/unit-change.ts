import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { stepperOf, type CatalogEntry } from "./catalog";
import { compatible, normalizeUnit, roundQuantity, unitInfo } from "./units";

/**
 * Changing how an item is counted (HomeFood 25-012): pasta kept in pieces,
 * now in grams.
 *
 * A unit that converts (g to kg) changes the item only, and its own step is
 * carried across in the new unit. A unit that does not convert cannot carry
 * an amount across: a piece of pasta has no weight anyone recorded. So:
 *   - what was at home goes back to "not counted yet" (never a made-up
 *     weight), and the change is recorded with the amount it had;
 *   - an open list entry starts again in the new unit at the item's usual
 *     buy (the catalog's pack, else the new unit's first natural amount);
 *   - the item's own step is dropped, since it was a step in the old unit.
 * `planUnitChange` is that decision, pure; `changeItemUnit` carries it out
 * in one transaction (`public.change_consumable_unit`).
 */

export type UnitChangePlan = {
  unit: string;
  baseUnit: string;
  step: number | null;
  /** The list's amount in the new base unit, when an entry has to start again; null when it carries across or there is none. */
  listQuantity: number | null;
  converts: boolean;
};

export function planUnitChange(
  item: { unit: string; step: number | null; catalog: Pick<CatalogEntry, "ladder" | "pack"> | null; onList: boolean },
  requested: string,
): UnitChangePlan | null {
  const unit = normalizeUnit(requested);
  if (!unit) return null;
  const from = unitInfo(item.unit);
  const to = unitInfo(unit);
  if (to.key === from.key) return null;
  if (compatible(item.unit, unit)) {
    // A step of 250 g is 0.25 kg: the same amount, said in the new unit.
    const step = item.step && item.step > 0 ? roundQuantity((item.step * from.factor) / to.factor) : null;
    return { unit: to.key, baseUnit: to.base, step: step && step > 0 ? step : null, listQuantity: null, converts: true };
  }
  const { start } = stepperOf({ unit: to.key, step: null, catalog: item.catalog });
  return { unit: to.key, baseUnit: to.base, step: null, listQuantity: item.onList ? start : null, converts: false };
}

export type UnitChangeResult = {
  unit: string;
  /** How much was at home, in the old base unit, before it went back to not counted; null when nothing was. */
  stockCleared: number | null;
  /** What is on the list now, in the new base unit; null when the item is not on it. */
  listAfter: number | null;
  converts: boolean;
};

export async function changeItemUnit(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    item: { id: string; unit: string; step: number | null; catalog: Pick<CatalogEntry, "ladder" | "pack"> | null; onList: boolean };
    unit: string;
    idempotencyKey: string;
  },
): Promise<UnitChangeResult | null> {
  const plan = planUnitChange(input.item, input.unit);
  if (!plan) return null;
  const { data, error } = await supabase.rpc("change_consumable_unit", {
    p_household_id: input.householdId,
    p_consumable_id: input.item.id,
    p_unit: plan.unit,
    p_base_unit: plan.baseUnit,
    p_step: plan.step,
    p_list_quantity: plan.listQuantity,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only adults change how an item is counted.");
    if (error.code === "23514") throw ApiError.notFound("That item is not on record in this household.");
    if (error.code === "22023") throw ApiError.badRequest("That unit could not be used.");
    throw new Error(`changeItemUnit failed: ${error.code ?? "unknown"}`);
  }
  const result = (data ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return { unit: plan.unit, stockCleared: number(result.stockCleared), listAfter: number(result.listAfter), converts: plan.converts };
}
