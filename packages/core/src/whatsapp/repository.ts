import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reading WhatsApp links for the app's screens (story 14-016), always with
 * the signed-in member's own session: RLS shows a member their own link and
 * an admin the household's, and nobody else a number. Who is connected — ids
 * only — comes from `public.household_whatsapp_members`, which any member
 * may ask about their own household.
 */

export type WhatsAppLink = { id: string; memberId: string; phone: string; connectedAt: Date; lastMessageAt: Date | null };

type Row = { id: string; member_id: string; phone_number: string; connected_at: string; last_message_at: string | null };

function fromRow(row: Row): WhatsAppLink {
  return {
    id: row.id,
    memberId: row.member_id,
    phone: row.phone_number,
    connectedAt: new Date(row.connected_at),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
  };
}

/** The live links this session may see: its own, or the household's for an admin. */
export async function listWhatsAppLinks(supabase: SupabaseClient, householdId: string): Promise<WhatsAppLink[]> {
  const { data, error } = await supabase
    .from("whatsapp_identities")
    .select("id, member_id, phone_number, connected_at, last_message_at")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("connected_at", { ascending: true });
  if (error) throw new Error(`listWhatsAppLinks failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(fromRow);
}

/** Members of the household with WhatsApp connected — ids only, for any member to see. */
export async function whatsappConnectedMembers(supabase: SupabaseClient, householdId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("household_whatsapp_members", { p_household_id: householdId });
  if (error) throw new Error(`household_whatsapp_members failed: ${error.code ?? "unknown"}`);
  return new Set(((data as (string | { household_whatsapp_members?: string })[] | null) ?? []).map((row) => (typeof row === "string" ? row : (row.household_whatsapp_members ?? ""))).filter(Boolean));
}

/** Ends a link: the member's own, or any in the household for an admin. Keeps everything made from it. */
export async function disconnectWhatsApp(supabase: SupabaseClient, identityId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("disconnect_whatsapp", { p_identity_id: identityId });
  if (error) {
    if (error.code === "42501") return false;
    throw new Error(`disconnect_whatsapp failed: ${error.code ?? "unknown"}`);
  }
  return data === true;
}
