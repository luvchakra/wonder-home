"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { listHomeSendChanges } from "@wonderhome/core/homesend/changes";
import { deleteArchivedHomeSendItems, removeHomeSendItems } from "@wonderhome/core/homesend/repository";
import { isHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { mayRemoveHomeSendItem, type RemoveActor } from "@wonderhome/core/homesend/remove";

import { undoHomeSendDocumentAction } from "./home-send-actions";

/**
 * Remove and Delete for good (the owner, 2026-11-03).
 *
 * Remove archives with the reason `removed_by_person` — instantly, with an
 * Undo (the archive's restore). An item that had added an entry is removed
 * together with that entry, through the same governed undo the detail has;
 * if the entry can't be undone the item stays. Delete for good, only from the
 * Archived view, deletes the intake item and its stored file — never what it
 * added. Both are for the item's sender (an adult) or an Admin, checked here
 * on the server against the rows; the database's delete policy checks again.
 */

export type RemoveState = {
  error?: string;
  done?: "removed" | "deleted";
  /** What moved, so Undo puts back exactly these. */
  ids?: string[];
  count?: number;
  /** How many of them had an entry that was undone with them. */
  entries?: number;
  /** Delete for good: items kept because they still have an entry on record. */
  kept?: number;
};

const MAX = 200;
const idsSchema = z.object({ householdId: z.uuid(), itemIds: z.array(z.uuid()).min(1).max(MAX) });
const NOT_ALLOWED = "Only an Admin, or the person who sent it, can remove this.";

function idsFrom(formData: FormData): string[] {
  return [...new Set(formData.getAll("itemId").filter((value): value is string => typeof value === "string"))];
}

function revalidateAll() {
  for (const path of ["/ai", "/home-send", "/bills", "/school", "/groceries", "/health", "/notifications", "/today"]) revalidatePath(path);
}

async function actorFor(householdId: string) {
  const supabase = await createClient();
  const membership = await requireMembership(supabase, householdId);
  const actor: RemoveActor = { memberId: membership.memberId, memberType: membership.memberType, isAdmin: isHouseholdAdmin(membership) };
  return { supabase, membership, actor };
}

/** "Remove": one item, or a folded group's items, archived — and the entry an added one made, undone. */
export async function removeHomeSendItemsAction(_previous: RemoveState, formData: FormData): Promise<RemoveState> {
  const parsed = idsSchema.safeParse({ householdId: formData.get("householdId"), itemIds: idsFrom(formData) });
  if (!parsed.success) return { error: "Please try again." };
  const { householdId, itemIds } = parsed.data;
  try {
    const { supabase, actor } = await actorFor(householdId);
    if (actor.memberType === "child" || actor.memberType === "helper") return { error: NOT_ALLOWED };

    // Anything that added an entry takes the entry with it (through the same undo the detail has).
    const live = new Set((await listHomeSendChanges(supabase, householdId)).filter((change) => !change.undoneAt && itemIds.includes(change.intakeId)).map((change) => change.intakeId));
    const ready: string[] = [];
    let entries = 0;
    let failure: string | undefined;
    for (const id of itemIds) {
      if (!live.has(id)) {
        ready.push(id);
        continue;
      }
      // The undo is the sender's or any member's to do; the remove below checks who may take the item itself.
      const probe = await removeCheck(supabase, householdId, id, actor);
      if (!probe) continue;
      const data = new FormData();
      data.set("householdId", householdId);
      data.set("itemId", id);
      const undone = await undoHomeSendDocumentAction({}, data);
      if (undone.error) {
        failure = undone.error;
        continue;
      }
      entries += 1;
      ready.push(id);
    }
    const { moved, refused } = await removeHomeSendItems(supabase, householdId, ready, actor);
    if (moved.length === 0) return { error: failure ?? (refused > 0 ? NOT_ALLOWED : "That item isn't here any more.") };
    await auditChange({ householdId, actorMemberId: actor.memberId, eventType: "homesend.removed", targetTable: "home_send_items", targetId: moved.length === 1 ? moved[0]! : null, metadata: { count: moved.length, entries } });
    revalidateAll();
    return { done: "removed", ids: moved, count: moved.length, entries };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/** True when this actor may remove the item (so its entry is not undone for someone who can't remove it). */
async function removeCheck(supabase: Awaited<ReturnType<typeof createClient>>, householdId: string, itemId: string, actor: RemoveActor): Promise<boolean> {
  const { data } = await supabase.from("home_send_items").select("created_by_member_id").eq("household_id", householdId).eq("id", itemId).maybeSingle();
  return Boolean(data) && mayRemoveHomeSendItem(actor, { createdByMemberId: (data as { created_by_member_id: string | null }).created_by_member_id ?? null });
}

/** "Delete for good": the chosen archived items, or (Admins) every archived item. */
export async function deleteArchivedHomeSendAction(_previous: RemoveState, formData: FormData): Promise<RemoveState> {
  const all = formData.get("all") === "1";
  const parsed = all ? z.object({ householdId: z.uuid() }).safeParse({ householdId: formData.get("householdId") }) : idsSchema.safeParse({ householdId: formData.get("householdId"), itemIds: idsFrom(formData) });
  if (!parsed.success) return { error: "Please try again." };
  const householdId = parsed.data.householdId;
  try {
    const { supabase, actor } = await actorFor(householdId);
    if (actor.memberType === "child" || actor.memberType === "helper") return { error: NOT_ALLOWED };
    if (all && !actor.isAdmin) return { error: "Only an Admin can delete everything archived." };
    const { deleted, kept } = await deleteArchivedHomeSendItems(supabase, householdId, { ids: all ? undefined : idsFrom(formData), actor });
    if (deleted.length === 0 && kept === 0) return { error: NOT_ALLOWED };
    // The id only: what was in it is gone with it.
    await Promise.all(deleted.map((id) => auditChange({ householdId, actorMemberId: actor.memberId, eventType: "homesend.deleted", targetTable: "home_send_items", targetId: id })));
    revalidateAll();
    return { done: "deleted", ids: deleted, count: deleted.length, kept };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}
