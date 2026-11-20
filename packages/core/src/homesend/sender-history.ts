import type { SupabaseClient } from "@supabase/supabase-js";

import { childrenOfSchoolItems, listPayeeBills } from "../homebrain/household-records";
import type { SenderHistory } from "../homebrain/memory-resolve";

/**
 * What an outside sender's earlier items became in this household (knowing
 * instead of asking, 2026-11-20): the child each school or class notice was
 * filed for, and the payee each bill was recorded with — what a person picked
 * or corrected at the time. Read with the member's own client (RLS keeps it
 * to their household), newest first, bounded. An email address only: a
 * member's own items have no outside sender to learn from.
 *
 * Never throws: with nothing readable the resolver simply has no history.
 */

/** Earlier items looked at; a sender's pattern shows in far fewer. */
const LIMIT = 20;

const EMPTY: SenderHistory = { children: [], payees: [] };

export async function readSenderHistory(client: SupabaseClient, householdId: string, sender: string | null | undefined, options: { exceptItemId?: string | null } = {}): Promise<SenderHistory> {
  const address = typeof sender === "string" ? sender.trim().toLowerCase() : "";
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(address)) return EMPTY;
  try {
    const { data, error } = await client
      .from("home_send_items")
      .select("id, routed_table, routed_id")
      .eq("household_id", householdId)
      .eq("sender_address", address)
      .eq("status", "routed")
      .in("routed_table", ["school_items", "obligations", "child_activity_notes"])
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error || !data) return EMPTY;
    const rows = (data as { id: string; routed_table: string; routed_id: string | null }[]).filter((row) => row.routed_id && row.id !== options.exceptItemId);
    const ids = (table: string) => rows.filter((row) => row.routed_table === table).map((row) => row.routed_id!);
    const itemOf = new Map(rows.map((row) => [row.routed_id!, row.id]));
    // What they became, read through HomeBrain (HomeSend touches only its own tables, X-003).
    const [school, bills] = await Promise.all([childrenOfSchoolItems(client, householdId, ids("school_items")), listPayeeBills(client, householdId, { ids: ids("obligations") })]);
    const children = school.map((row) => ({ memberId: row.childMemberId, itemId: itemOf.get(row.id)! }));
    const payees = bills.filter((row) => row.payee && row.payee.trim().length > 0).map((row) => ({ name: row.payee!.trim(), itemId: itemOf.get(row.id)! }));
    return { children, payees };
  } catch {
    return EMPTY;
  }
}

/**
 * Keeps what the household's memory filled on the item itself
 * (`understanding.filled`), so the HomeSend list and "Why?" can say where a
 * Checking entry's payee, amount, day or child came from. Best-effort: a
 * write that loses a race leaves the entry as recorded, just without the line.
 */
export async function keepFilledWhy(client: SupabaseClient, householdId: string, itemId: string, filled: { why: readonly string[]; fields: readonly string[] }): Promise<void> {
  if (filled.why.length === 0) return;
  try {
    const { data } = await client.from("home_send_items").select("understanding, updated_at").eq("household_id", householdId).eq("id", itemId).maybeSingle();
    const understanding = (data?.understanding as Record<string, unknown> | null) ?? null;
    if (!understanding) return;
    await client
      .from("home_send_items")
      .update({ understanding: { ...understanding, filled: { why: filled.why.slice(0, 6).map((line) => line.slice(0, 300)), fields: [...new Set(filled.fields)].slice(0, 10) } } })
      .eq("household_id", householdId)
      .eq("id", itemId)
      .eq("updated_at", data!.updated_at as string);
  } catch {
    // The entry stands as recorded.
  }
}
