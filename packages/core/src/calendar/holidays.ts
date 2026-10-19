import type { SupabaseClient } from "@supabase/supabase-js";

import type { HolidayRecord } from "./projection";

/**
 * The household's public holidays for HomeBrain (14-034): the country the
 * household is in (`households.region`), national days only — a state's own
 * holidays are a person's calendar choice, not the household's. Read in two
 * plain filters, bounded by the range.
 */
export async function listHouseholdHolidays(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }): Promise<HolidayRecord[]> {
  const { data: household, error } = await supabase.from("households").select("region").eq("id", householdId).maybeSingle();
  if (error) throw new Error(`household region failed: ${error.code ?? "unknown"}`);
  const region = typeof household?.region === "string" ? household.region.slice(0, 2) : null;
  if (!region) return [];
  const { data, error: holidaysError } = await supabase
    .from("public_holidays")
    .select("id, on_date, name, source")
    .eq("region", region)
    .is("subregion", null)
    .gte("on_date", range.from)
    .lte("on_date", range.to)
    .order("on_date")
    .limit(100);
  if (holidaysError) throw new Error(`holidays failed: ${holidaysError.code ?? "unknown"}`);
  return ((data ?? []) as { id: string; on_date: string; name: string; source: string }[]).map((row) => ({ id: row.id, onDate: row.on_date, name: row.name, source: row.source }));
}
