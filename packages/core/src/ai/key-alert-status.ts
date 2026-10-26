import type { SupabaseClient } from "@supabase/supabase-js";

import { QUOTA_ALERT_AFTER_MS, type AiKeyAlertRow } from "../notifications/notices";

/**
 * The household's AI keys a provider has stopped taking, for screens to say
 * so (the owner, 2026-10-26: "show error message in app for something like
 * this"). The same rows and the same ten-minute rule for a quota refusal as
 * the notice (`notices.ts` `aiKeyNotices`). Read through the member's own
 * session (`my_household_ai_key_alerts`: their household only, never a key);
 * a failed read is no alert, never a broken page.
 */
export async function openKeyAlerts(supabase: SupabaseClient, householdId: string): Promise<AiKeyAlertRow[]> {
  try {
    const { data, error } = await supabase.rpc("my_household_ai_key_alerts", { p_household_id: householdId });
    if (error) return [];
    return ((data ?? []) as AiKeyAlertRow[]).filter(
      (row) => row.kind !== "quota_exhausted" || new Date(row.last_seen_at).getTime() - new Date(row.first_seen_at).getTime() >= QUOTA_ALERT_AFTER_MS,
    );
  } catch {
    return [];
  }
}

export const KEY_PROVIDER_NAME: Record<AiKeyAlertRow["provider"], string> = { anthropic: "Anthropic", google: "Google", openai: "OpenAI" };
