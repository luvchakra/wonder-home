import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { BudgetPeriod } from "./budgets";

/**
 * Budgets as the household keeps them (story 11-007, 22-007). Adults with
 * finance access read them; only an Admin sets, changes or retires one (RLS
 * `budgets_write_admin`). Retiring keeps the row and turns it off, never a
 * hard delete, and setting the same kind and period again brings it back.
 */
export type Budget = {
  id: string;
  category: string;
  period: BudgetPeriod;
  limitMinor: number;
  currency: string;
};

export async function listBudgets(supabase: SupabaseClient, householdId: string): Promise<Budget[]> {
  const { data, error } = await supabase
    .from("budgets")
    .select("id, category, period, limit_minor, currency")
    .eq("household_id", householdId)
    .eq("active", true)
    .order("category");
  if (error) throw new Error(`listBudgets failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    category: row.category as string,
    period: row.period as BudgetPeriod,
    limitMinor: Number(row.limit_minor),
    currency: row.currency as string,
  }));
}

function forbidden(error: { code?: string } | null): never {
  if (error?.code === "42501") throw ApiError.forbidden("Only a household administrator can change a budget.");
  throw new Error(`budget write failed: ${error?.code ?? "unknown"}`);
}

/** Sets a budget for one kind of bill and period — a new one, or the same kind and period changed or brought back. */
export async function saveBudget(
  supabase: SupabaseClient,
  input: { householdId: string; id?: string; category: string; period: BudgetPeriod; limitMinor: number; currency: string },
): Promise<void> {
  const values = { category: input.category, period: input.period, limit_minor: input.limitMinor, currency: input.currency, active: true };
  if (input.id) {
    const { data, error } = await supabase.from("budgets").update(values).eq("id", input.id).eq("household_id", input.householdId).select("id");
    if (error) {
      if (error.code === "23505") throw ApiError.conflict("There is already a budget for that kind of bill and period.");
      forbidden(error);
    }
    if (!data?.length) throw ApiError.notFound("That budget is no longer there.");
    return;
  }
  const { error } = await supabase
    .from("budgets")
    .upsert({ household_id: input.householdId, ...values }, { onConflict: "household_id,category,period" });
  if (error) forbidden(error);
}

/** Turns a budget off. The row stays, so its history is never orphaned. */
export async function retireBudget(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { data, error } = await supabase
    .from("budgets")
    .update({ active: false })
    .eq("id", input.id)
    .eq("household_id", input.householdId)
    .select("id");
  if (error) forbidden(error);
  if (!data?.length) throw ApiError.notFound("That budget is no longer there.");
}
