import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { auditChange } from "../api/audit";
import { cancelObligation } from "./repository";

/**
 * Removing bills from the list (the owner, 2026-11-20: "add option to delete
 * these entries … there should be option to clean up easily"). One write for
 * the bill row's Remove and for "Tidy up", so both say and do the same thing.
 *
 *   - A bill is stood down (`status = cancelled`), never hard-deleted
 *     (CLAUDE.md rule 12): its recorded payments stay on Transactions and in
 *     the monthly spend, so no money history goes silently.
 *   - Its reminders go at the next reconcile: the reminder source only reads
 *     open bills (`notifications/reconcile.ts`).
 *   - A bill HomeSend added keeps its source consistent: the live
 *     `homesend_changes` rows that point at it are marked undone by this
 *     person, and an item with nothing left live is marked undone, exactly as
 *     Undo leaves it — so nothing shows "added" for a bill that is gone, and
 *     the item is never picked up again to be added a second time.
 *   - Only an Admin removes a bill, the same rule as editing one (RLS agrees).
 *
 * Removing is an action that needs the person's yes: the screen asks once,
 * naming each bill, before this runs. Nothing here pays or settles anything.
 */
export type RemoveBillsActor = { memberId: string; isAdmin: boolean };

export type RemoveBillsResult = { removed: string[]; releasedIntakes: string[] };

/** At most this many in one go — "Tidy up" picks from one screen's list. */
export const REMOVE_BILLS_MAX = 50;

export function mayRemoveBills(actor: RemoveBillsActor): boolean {
  return actor.isAdmin;
}

export async function removeBills(
  supabase: SupabaseClient,
  input: { householdId: string; ids: readonly string[]; actor: RemoveBillsActor },
): Promise<RemoveBillsResult> {
  if (!mayRemoveBills(input.actor)) throw ApiError.forbidden("Only an Admin can remove a bill.");
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) return { removed: [], releasedIntakes: [] };
  if (ids.length > REMOVE_BILLS_MAX) throw ApiError.badRequest(`Remove up to ${REMOVE_BILLS_MAX} bills at a time.`);

  // Only this household's bills that are still on the list; anything else is ignored, never touched.
  const { data, error } = await supabase
    .from("obligations")
    .select("id, name, status")
    .eq("household_id", input.householdId)
    .in("id", ids)
    .neq("status", "cancelled");
  if (error) throw new Error(`removeBills read failed: ${error.code ?? "unknown"}`);
  const found = ((data as { id: string; name: string; status: string }[] | null) ?? []);

  const removed: string[] = [];
  for (const bill of found) {
    await cancelObligation(supabase, { id: bill.id, householdId: input.householdId });
    removed.push(bill.id);
  }
  if (removed.length === 0) return { removed, releasedIntakes: [] };

  const releasedIntakes = await releaseHomeSendLinks(supabase, input.householdId, removed, input.actor.memberId);

  for (const bill of found) {
    await auditChange({
      householdId: input.householdId,
      actorMemberId: input.actor.memberId,
      eventType: "finance.bill_removed",
      targetTable: "obligations",
      targetId: bill.id,
      metadata: { previousStatus: bill.status, bulk: removed.length > 1 },
    });
  }
  return { removed, releasedIntakes };
}

/**
 * The HomeSend side of a removed bill: its live changes are undone by this
 * person, and each item with nothing left live is marked undone. Returns the
 * items released. Never throws for this part — the bill is already removed,
 * and an item left "added" is cosmetic, not money.
 */
async function releaseHomeSendLinks(
  supabase: SupabaseClient,
  householdId: string,
  billIds: readonly string[],
  memberId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("homesend_changes")
      .update({ undone_at: new Date().toISOString(), undone_by_member_id: memberId })
      .eq("household_id", householdId)
      .eq("domain", "bill")
      .in("entity_id", [...billIds])
      .is("undone_at", null)
      .select("id, intake_id");
    if (error || !data) return [];
    const intakes = [...new Set((data as { intake_id: string }[]).map((row) => row.intake_id))];
    const released: string[] = [];
    for (const intakeId of intakes) {
      const { count } = await supabase
        .from("homesend_changes")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("intake_id", intakeId)
        .is("undone_at", null);
      if ((count ?? 0) > 0) continue;
      const { error: itemError } = await supabase.from("home_send_items").update({ status: "undone" }).eq("household_id", householdId).eq("id", intakeId);
      if (!itemError) released.push(intakeId);
    }
    for (const row of data as { id: string }[]) {
      await auditChange({ householdId, actorMemberId: memberId, eventType: "homesend.undone", targetTable: "homesend_changes", targetId: row.id, metadata: { why: "bill_removed" } });
    }
    return released;
  } catch {
    return [];
  }
}
