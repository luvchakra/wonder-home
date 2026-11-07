import type { SupabaseClient } from "@supabase/supabase-js";

import { CONSUMABLE_CATEGORIES } from "@wonderhome/core/commerce/consumables";
import { type AddedOnItsOwn, DEFAULT_AUTO_ADD_PERCENT, scorePercent, sureWhy, type WaitingInHomeSend } from "@wonderhome/core/homesend/auto-add";
import { beginChecking } from "@wonderhome/core/hometalk/checking-questions";
import { loadAutoAddPercent } from "@wonderhome/core/household/auto-add-repository";
import { recordHomeSendChange, type RecordHomeSendChangeInput } from "@wonderhome/core/homesend/changes";
import type { HomeSendExtraction, HomeSendKind } from "@wonderhome/core/homesend/items";
import { getHomeSendItem, routeHomeSendItem } from "@wonderhome/core/homesend/repository";
import type { SubjectResolution } from "@wonderhome/core/homesend/resolve";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { OBLIGATION_KINDS } from "@wonderhome/core/finance/payments";
import { RECORD_TYPES } from "@wonderhome/core/health/records";

import { prepareReview } from "./home-send-review";
import { createNew, recordReceipt, reviseExisting, type RouteInput } from "./home-send-writes";

/** Where each kind added on its own lands, by the area's own name. */
const WHERE: Partial<Record<HomeSendKind, string>> = {
  grocery_item: "Groceries",
  school_item: "Kids & School",
  bill: "Bills",
  receipt: "Groceries",
  health_document: "Health",
};

/**
 * Applying an item the household's own autonomy setting allows (§12): the
 * same governed create a person's confirm uses, recorded as a change with
 * the same Undo, and marked `auto_added` so it is never mistaken for a
 * person's decision (§19).
 *
 * A bill, receipt or health document reaches here only when the Admin's
 * matching "add directly" setting is on (`confirmation.ts`, the owner
 * 2026-10-26). A bill becomes a record on Bills, never a payment; a receipt
 * records its lines as purchases and touches nothing at home or on the list;
 * a health record is filed for the one person it is about, private, through
 * the same self-or-guardian rule a person's confirm meets.
 */
export async function autoApplyHomeSendItem(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  item: { id: string; kind: HomeSendKind; extracted: HomeSendExtraction | null; subject: SubjectResolution | null },
  /**
   * `added` when a person said yes to it among several (bulk review, the owner
   * 2026-11-03): the same governed write and the same Undo, recorded as their
   * decision rather than as added on its own.
   */
  options: {
    decision?: "auto_added" | "added";
    /**
     * Added on its own (never with a person's "added"): how sure, from where,
     * and whether it is still being checked — below the household's bar, or
     * read from a photo or file (the owner, 2026-11-03). Audited as
     * `homesend.auto_added`; an unconfirmed entry shows Checking and its
     * reminders wait. With a person's "added" it is "Add all anyway" (the
     * owner, 2026-11-03): their decision, still shown as Checking.
     */
    checking?: { unconfirmed: boolean; confidence: number | null; source: string | null };
    /**
     * A clear move of a record already on file (`confirmation.ts` `update`,
     * 14-066 part 3): that record goes to its new day through the governed
     * update a person's "Update" uses, recorded with what it replaced so Undo
     * puts the old day back. Nothing new is added.
     */
    update?: { existingId: string; title: string; from: string | null; to: string };
  } = {},
): Promise<{ changeId: string; title: string; where: string; more?: AddedOnItsOwn["more"]; whole?: boolean; moved?: AddedOnItsOwn["moved"] } | null> {
  const extracted = item.extracted;
  const title = extracted?.title?.trim();
  const where = WHERE[item.kind];
  if (!title || !where) return null;
  const householdId = membership.household.id;
  // A person's yes is their own decision; "Add all anyway" is a person's yes that is still being checked, so it carries its state.
  const auto = options.decision === "added" && !options.checking ? undefined : autoState(options.checking);
  // A receipt's lines are a person's choices on its own form; only "add on its own" (or "add all anyway") records them all as new.
  if (item.kind === "receipt") return options.decision === "added" && !options.checking ? null : autoRecordReceipt(supabase, membership, { id: item.id, title, extracted }, auto);
  if (item.kind !== "grocery_item" && item.kind !== "school_item" && item.kind !== "bill" && item.kind !== "health_document") return null;
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
    payee: extracted?.payee ?? undefined,
    amount: typeof extracted?.amount === "number" ? extracted.amount : undefined,
    currency: extracted?.currency ?? undefined,
    billKind: OBLIGATION_KINDS.find((kind) => kind === extracted?.billKind),
    healthRecordType: RECORD_TYPES.find((type) => type === extracted?.healthRecordType),
    documentDate: extracted?.documentDate ?? undefined,
    // A health record is for the one person it named; never "for me" by default when added on its own.
    subjectMemberId: item.kind === "health_document" ? item.subject?.selected?.memberId : undefined,
    needs: [],
  };
  if (item.kind === "health_document" && !input.subjectMemberId) return null;
  if (options.update) return autoMove(supabase, membership, { ...input, title: options.update.title || input.title }, options.update, where, autoState(options.checking));
  const created = await createNew(supabase, membership, input);
  if ("error" in created) return null;
  await routeHomeSendItem(supabase, householdId, item.id, {
    routedTable: created.routedTable,
    routedId: created.routedId,
    review: { decision: options.decision ?? "auto_added", subject: item.subject?.selected ? "resolved" : "not_needed", corrected: false },
  });
  const change = await recordHomeSendChange(supabase, {
    householdId,
    intakeId: item.id,
    domain: item.kind,
    entityId: created.routedId,
    createdByMemberId: membership.memberId,
    ...(created.changeType === "updated" ? { changeType: "updated" as const, previous: created.previous ?? {} } : {}),
    ...(auto ? { auto } : {}),
  });
  return { changeId: change.id, title, where, ...(created.more ? { more: created.more } : {}) };
}

/** A record on file moved to its new day on its own (14-066, part 3): the same write, change row, audit and Undo as a person's "Update". */
async function autoMove(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  input: RouteInput,
  update: { existingId: string; title: string; from: string | null; to: string },
  where: string,
  auto: RecordHomeSendChangeInput["auto"],
): Promise<{ changeId: string; title: string; where: string; moved: NonNullable<AddedOnItsOwn["moved"]> } | null> {
  if (input.kind !== "bill" && input.kind !== "school_item") return null;
  const revised = await reviseExisting(supabase, membership, { ...input, decision: "update", existingId: update.existingId, dueDate: update.to, amount: undefined }).catch(() => null);
  if (!revised) return null;
  await routeHomeSendItem(supabase, input.householdId, input.itemId, {
    routedTable: revised.routedTable,
    routedId: revised.routedId,
    review: { decision: "auto_added", subject: "not_needed", corrected: false },
  });
  const change = await recordHomeSendChange(supabase, {
    householdId: input.householdId,
    intakeId: input.itemId,
    domain: revised.domain,
    entityId: revised.routedId,
    createdByMemberId: membership.memberId,
    changeType: "updated",
    previous: revised.previous,
    ...(auto ? { auto } : {}),
  });
  return { changeId: change.id, title: input.title, where, moved: { from: update.from, to: update.to } };
}

/** What an entry added on its own records about itself; "confirmed" unless the decision said it is still being checked. */
function autoState(checking: { unconfirmed: boolean; confidence: number | null; source: string | null } | undefined): RecordHomeSendChangeInput["auto"] {
  return { state: checking?.unconfirmed ? "unconfirmed" : "confirmed", confidence: checking?.confidence ?? null, source: checking?.source ?? null };
}

/**
 * A receipt added on its own: each line it read, recorded as a purchase
 * against the tracked item of that name or a newly tracked one, through the
 * same write a person's confirm uses. What is at home and the list are left
 * alone — those are a person's choices on the receipt's own form. Undo takes
 * back every line at once (`whole`).
 */
async function autoRecordReceipt(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  item: { id: string; title: string; extracted: HomeSendExtraction | null },
  auto: RecordHomeSendChangeInput["auto"],
): Promise<{ changeId: string; title: string; where: string; whole: true } | null> {
  const read = item.extracted;
  const purchasedOn = read?.documentDate?.slice(0, 10);
  const lines = (read?.lines ?? []).filter((line) => line.name.trim().length > 0);
  if (!read?.merchant?.trim() || !purchasedOn || lines.length === 0) return null;
  const householdId = membership.household.id;
  const recorded = await recordReceipt(
    supabase,
    membership,
    { householdId, itemId: item.id, merchant: read.merchant.trim().slice(0, 120), purchasedOn, currency: read.currency ?? null },
    lines.slice(0, 40).map((line) => ({
      name: line.name.trim().slice(0, 120),
      quantity: typeof line.quantity === "number" && line.quantity > 0 ? line.quantity : "",
      unit: (line.unit ?? "").slice(0, 20),
      lineTotal: typeof line.lineTotal === "number" && line.lineTotal >= 0 ? line.lineTotal : "",
      match: "new",
      stock: false,
      clear: false,
    })),
    auto,
  );
  if ("error" in recorded) return null;
  await routeHomeSendItem(supabase, householdId, item.id, {
    routedTable: "consumable_purchases",
    routedId: recorded.firstPurchase,
    review: { decision: "auto_added", subject: "not_needed", corrected: false },
  });
  return { changeId: recorded.firstPurchase, title: item.title, where: "Groceries", whole: true };
}

/**
 * HomeSend's own decision on an item nobody is reviewing right now — once
 * HomeTalk has nothing left to ask about it, or a WhatsApp item arrives
 * complete: the same review the app runs, as this member, and only an "add on
 * its own" decision is acted on (Pre Approved and above the household's bar).
 * Anything else stays waiting in HomeSend: when it would otherwise have been
 * added on its own, with why (`confirmation.ts` `wait`, I-27), so the reply can
 * say so. Null when nothing was added and there is nothing to say.
 */
export async function addIfAllowed(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  itemId: string,
  options: { createdByMemberId?: string } = {},
): Promise<AddedOnItsOwn | WaitingInHomeSend | null> {
  const item = await getHomeSendItem(supabase, membership.household.id, itemId);
  if (!item || item.status !== "classified" || !item.classifiedKind) return null;
  const review = await prepareReview(supabase, membership, { ...item, createdByMemberId: options.createdByMemberId ?? item.createdByMemberId });
  if (review.plan) return null;
  if (review.confirmation.mode !== "auto_apply") {
    const title = item.extracted?.title?.trim();
    return review.confirmation.wait && title ? { waiting: review.confirmation.wait, title } : null;
  }
  const unconfirmed = review.confirmation.unconfirmed === true;
  const applied = await autoApplyHomeSendItem(
    supabase,
    membership,
    { id: item.id, kind: item.classifiedKind, extracted: item.extracted, subject: review.subject },
    { checking: { unconfirmed, confidence: review.understanding?.score ?? null, source: item.source }, ...(review.confirmation.update ? { update: review.confirmation.update } : {}) },
  );
  // How sure, and why, goes with every "added on its own" message (design §7).
  if (!applied) return null;
  // Added as Checking: HomeTalk's questions about it are planned now, from
  // what the reading holds, for the person who sent it in (14-061).
  if (unconfirmed) {
    const percent = await loadAutoAddPercent(supabase, membership.household.id).catch(() => DEFAULT_AUTO_ADD_PERCENT);
    await beginChecking(supabase, { householdId: membership.household.id, itemId: item.id, recipientMemberId: options.createdByMemberId ?? item.createdByMemberId ?? membership.memberId, score: review.understanding?.score ?? null, percent });
  }
  const more = review.confirmation.topUp && applied.more ? { more: applied.more } : {};
  const checking = unconfirmed ? { unconfirmed: true as const } : {};
  const moved = applied.moved ? { moved: applied.moved } : {};
  return { title: applied.title, where: applied.where, kind: item.classifiedKind, percent: scorePercent(review.understanding?.score), why: sureWhy(review.understanding), ...more, ...checking, ...moved };
}
