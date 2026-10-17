import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/**
 * Write a household's key row without ever reading the key.
 *
 * Every key table lets a household session write `api_key` but never select
 * it (column privileges). An upsert cannot work under that rule, because
 * Postgres needs SELECT on the columns `ON CONFLICT DO UPDATE` sets. So the
 * row is inserted, and when one already exists it is updated by household
 * id instead. Neither statement reads the key back.
 */
export async function writeKeyRow(
  supabase: SupabaseClient,
  table: "household_ai_credentials" | "household_voice_credentials" | "household_gemini_voice_credentials",
  row: { household_id: string; provider: string; api_key: string; set_by_member_id: string },
): Promise<PostgrestError | null> {
  const { error } = await supabase.from(table).insert(row);
  if (error?.code !== "23505") return error;
  const { household_id: householdId, ...changes } = row;
  const { error: updateError } = await supabase.from(table).update(changes).eq("household_id", householdId);
  return updateError;
}
