import type { SupabaseClient } from "@supabase/supabase-js";

import { CONSUMABLE_CATEGORIES } from "@wonderhome/core/commerce/consumables";
import { type AddedOnItsOwn, scorePercent, sureWhy } from "@wonderhome/core/homesend/auto-add";
import { recordHomeSendChange } from "@wonderhome/core/homesend/changes";
import type { HomeSendExtraction, HomeSendKind } from "@wonderhome/core/homesend/items";
import { getHomeSendItem, routeHomeSendItem } from "@wonderhome/core/homesend/repository";
import type { SubjectResolution } from "@wonderhome/core/homesend/resolve";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";

import { prepareReview } from "./home-send-review";
import { createNew, type RouteInput } from "./home-send-writes";

/**
 * Applying an item the household's own autonomy setting allows (§12): the
 * same governed create a person's confirm uses, recorded as a change with
 * the same Undo, and marked `auto_added` so it is never mistaken for a
 * person's decision (§19).
 */
export async function autoApplyHomeSendItem(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  item: { id: string; kind: HomeSendKind; extracted: HomeSendExtraction | null; subject: SubjectResolution | null },
): Promise<{ changeId: string; title: string; where: string } | null> {
  const extracted = item.extracted;
  const title = extracted?.title?.trim();
  if (!title || (item.kind !== "grocery_item" && item.kind !== "school_item")) return null;
  const householdId = membership.household.id;
  const input: RouteInput = {
    householdId,
    itemId: item.id,
    decision: "add",
    kind: item.kind,
    title: title.slice(0, 160),
    notes: extracted?.notes ?? undefined,
    location: extracted?.location ?? undefined,
    dueDate: extracted?.dueDate ?? undefined,
    dueTime: extracted?.dueTime ?? undefined,
    endTime: extracted?.endTime ?? undefined,
    childMemberId: item.subject?.selected?.memberId,
    schoolKind: SCHOOL_ITEM_KINDS.find((schoolKind) => schoolKind === extracted?.schoolKind),
    subject: extracted?.subject ?? undefined,
    quantity: extracted?.quantity ?? undefined,
    unit: extracted?.unit ?? undefined,
    category: CONSUMABLE_CATEGORIES.find((category) => category === extracted?.category),
    needs: [],
  };
  const created = await createNew(supabase, membership, input);
  if ("error" in created) return null;
  await routeHomeSendItem(supabase, householdId, item.id, {
    routedTable: created.routedTable,
    routedId: created.routedId,
    review: { decision: "auto_added", subject: item.subject?.selected ? "resolved" : "not_needed", corrected: false },
  });
  const change = await recordHomeSendChange(supabase, {
    householdId,
    intakeId: item.id,
    domain: item.kind,
    entityId: created.routedId,
    createdByMemberId: membership.memberId,
    ...(created.changeType === "updated" ? { changeType: "updated" as const, previous: created.previous ?? {} } : {}),
  });
  return { changeId: change.id, title, where: item.kind === "grocery_item" ? "Groceries" : "Kids & School" };
}

/**
 * HomeSend's own decision on an item nobody is reviewing right now — once
 * HomeTalk has nothing left to ask about it, or a WhatsApp item arrives
 * complete: the same review the app runs, as this member, and only an "add on
 * its own" decision is acted on (Pre Approved and above the household's bar).
 * Anything else stays waiting in HomeSend. Null when nothing was added.
 */
export async function addIfAllowed(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  itemId: string,
  options: { createdByMemberId?: string } = {},
): Promise<AddedOnItsOwn | null> {
  const item = await getHomeSendItem(supabase, membership.household.id, itemId);
  if (!item || item.status !== "classified" || !item.classifiedKind) return null;
  const review = await prepareReview(supabase, membership, { ...item, createdByMemberId: options.createdByMemberId ?? item.createdByMemberId });
  if (review.confirmation.mode !== "auto_apply" || review.plan) return null;
  const applied = await autoApplyHomeSendItem(supabase, membership, { id: item.id, kind: item.classifiedKind, extracted: item.extracted, subject: review.subject });
  // How sure, and why, goes with every "added on its own" message (design §7).
  return applied ? { title: applied.title, where: applied.where, percent: scorePercent(review.understanding?.score), why: sureWhy(review.understanding) } : null;
}
