import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Undoing a night's change (HomeBrain Sleep): every merge, split, move,
 * expiry and rest is put back exactly as it was before, from what the
 * change recorded — the memories, and their places in HomeBrain Review.
 * What a split wrote is retired the same way. "Bring back" on a resting
 * memory is this, for a rest. A conflict has nothing to undo: it is a
 * question, answered in Review.
 */

export type UndoOutcome = "undone" | "already_undone" | "not_found" | "changed_since" | "not_undoable";

type Row = Record<string, unknown>;
type Before = { id: string; status: string; tier: string; member_id: string | null; scope: string; merged_into: string | null };
type ItemBefore = { id: string; status: string; member_id: string | null; scope: string };

export async function undoConsolidation(admin: SupabaseClient, input: { householdId: string; consolidationId: string; memberId: string }): Promise<UndoOutcome> {
  const { data } = await admin
    .from("homebrain_consolidations")
    .select("id, kind, detail, undone_at")
    .eq("household_id", input.householdId)
    .eq("id", input.consolidationId)
    .maybeSingle();
  const row = data as Row | null;
  if (!row) return "not_found";
  if (row.undone_at) return "already_undone";
  if (row.kind === "conflict" || row.kind === "linked") return "not_undoable";
  const detail = (row.detail ?? {}) as { before?: { memories?: Before[]; items?: ItemBefore[] }; created?: string[] };

  // What a split wrote goes first, so the original can come back under its own key.
  const created = detail.created ?? [];
  if (created.length > 0) {
    await admin.from("memories").update({ status: "superseded" }).eq("household_id", input.householdId).in("id", created);
    await admin.from("certification_items").update({ status: "corrected" }).eq("household_id", input.householdId).in("memory_id", created);
  }

  for (const memory of detail.before?.memories ?? []) {
    const { error } = await admin
      .from("memories")
      .update({ status: memory.status, tier: memory.tier, member_id: memory.member_id, scope: memory.scope, merged_into: memory.merged_into })
      .eq("household_id", input.householdId)
      .eq("id", memory.id);
    // 23505: something newer now says the same — the household changed it since, and that stands.
    if (error) return "changed_since";
  }
  for (const item of detail.before?.items ?? []) {
    await admin.from("certification_items").update({ status: item.status, member_id: item.member_id, scope: item.scope }).eq("household_id", input.householdId).eq("id", item.id);
  }

  await admin.from("homebrain_consolidations").update({ undone_at: new Date().toISOString(), undone_by: input.memberId }).eq("household_id", input.householdId).eq("id", input.consolidationId);
  return "undone";
}
