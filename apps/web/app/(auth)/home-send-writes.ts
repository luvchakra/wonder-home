import { revalidatePath } from "next/cache";
import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { CONSUMABLE_CATEGORIES } from "@wonderhome/core/commerce/consumables";
import { createConsumable } from "@wonderhome/core/commerce/repository";
import type { createClient } from "@wonderhome/core/db/server";
import { OBLIGATION_KINDS } from "@wonderhome/core/finance/payments";
import { cancelObligation, createObligation, listObligations, updateObligation } from "@wonderhome/core/finance/repository";
import { createRecord, RECORD_TYPES } from "@wonderhome/core/health/records";
import { HOME_SEND_REVIEW_PROPOSALS, HOME_SEND_REVIEW_SUBJECTS } from "@wonderhome/core/homesend/items";
import { getHomeSendItem } from "@wonderhome/core/homesend/repository";
import { createChildMember } from "@wonderhome/core/identity/children";
import { requireHouseholdAdmin, type requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { cancelSchoolItem, createSchoolItem, listSchoolItems, updateSchoolItem } from "@wonderhome/core/school/repository";
import { movedSchoolWhen, schoolWhen } from "@wonderhome/core/school/times";

/**
 * The writes HomeSend makes into a domain, through that domain's own
 * governed service (Wave 3 §10–11, DDU 2.0 §38) — shared by the one-item
 * confirm (`home-send-actions.ts`) and the document plan
 * (`home-send-plan-actions.ts`).
 *
 * Deliberately not a "use server" module: nothing here is callable from a
 * browser. Each caller validates, authorizes and decides first; these only
 * perform the write it decided on.
 */

export const routeSchema = z.object({
  householdId: z.uuid(),
  itemId: z.uuid(),
  /**
   * What the person decided (Wave 3 §10, §13): add it as new, update or
   * cancel the record it matched, or keep the existing one and change
   * nothing. The last three only ever act on `existingId`, which the server
   * re-checks is part of this household before touching it.
   */
  decision: z.enum(["add", "update", "cancel", "keep"]).default("add"),
  existingId: z.uuid().optional(),
  kind: z.enum(["bill", "school_item", "grocery_item", "health_document"]),
  title: z.string().trim().min(1, { error: "What is it?" }).max(160),
  notes: z.string().trim().max(2000).optional(),
  // bill
  billKind: z.enum(OBLIGATION_KINDS).optional(),
  payee: z.string().trim().max(120).optional(),
  amount: z.union([z.coerce.number().min(0).max(10_000_000), z.literal("")]).optional(),
  currency: z.string().trim().max(8).optional(),
  dueDate: z.string().optional(),
  // school — a local start and end ("HH:MM"); empty means all day.
  dueTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
  endTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
  // A child already on record, or "new": a child the notice names who is not
  // on record yet, added in the same step (story 08-009).
  childMemberId: z.union([z.uuid(), z.literal("new")]).optional(),
  newChildName: z.string().trim().min(1, { error: "What is the child's name?" }).max(80).optional(),
  newChildDob: z.union([z.iso.date(), z.literal("")]).optional(),
  schoolKind: z.enum(SCHOOL_ITEM_KINDS).optional(),
  subject: z.string().trim().max(60).optional(),
  // grocery
  quantity: z.union([z.coerce.number().min(0.01).max(10_000), z.literal("")]).optional(),
  unit: z.string().trim().max(40).optional(),
  category: z.string().trim().max(40).optional(),
  // health_document — subjectMemberId empty/omitted means "for me" (see
  // routing below): the extracted subjectMemberName is only ever a hint
  // shown beside this picker, never trusted to select an identity itself.
  subjectMemberId: z.uuid().optional(),
  healthRecordType: z.enum(RECORD_TYPES).optional(),
  documentDate: z.string().optional(),
  // Needs the same content implies (§11): each ticked one becomes its own
  // grocery row, separately undoable. Nothing unticked is ever written.
  needs: z.array(z.string().trim().min(1).max(160)).max(5).default([]),
  // Set once the person has seen a reconciliation candidate and said this
  // really is a different one.
  confirmDuplicate: z.literal("on").optional(),
  // What the review showed (§19's metrics): the reconciliation it offered
  // and whether "who is this for" had to be asked. Closed words only; they
  // describe the review, never decide anything.
  proposal: z.enum(HOME_SEND_REVIEW_PROPOSALS).optional(),
  subjectState: z.enum(HOME_SEND_REVIEW_SUBJECTS).optional(),
});

export type RouteInput = z.infer<typeof routeSchema>;

export type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Membership = Awaited<ReturnType<typeof requireMembership>>;

/**
 * Updating or cancelling a record already on record (§10) — through the same
 * governed service a manual edit or remove uses, keeping what it replaced so
 * undo can put it back exactly.
 */
export async function reviseExisting(
  supabase: Supabase,
  membership: Membership,
  input: RouteInput & { existingId: string; decision: "update" | "cancel" },
): Promise<{ routedTable: string; routedId: string; changeType: "updated" | "cancelled"; previous: Record<string, unknown>; domain: "bill" | "school_item" }> {
  const householdId = input.householdId;
  if (input.kind === "school_item") {
    const existing = (await listSchoolItems(supabase, householdId)).find((item) => item.id === input.existingId);
    if (!existing) throw new Error("existing school item not found");
    const previous = { dueAt: existing.dueAt?.toISOString() ?? null, dueTimeKnown: existing.dueTimeKnown, endsAt: existing.endsAt?.toISOString() ?? null, status: existing.status };
    if (input.decision === "cancel") {
      await cancelSchoolItem(supabase, householdId, existing.id);
      return { routedTable: "school_items", routedId: existing.id, changeType: "cancelled", previous, domain: "school_item" };
    }
    // A new time from the notice wins; otherwise a moved day keeps the time it had (14-014).
    const timezone = membership.household.timezone;
    const when = !input.dueDate
      ? { dueAt: previous.dueAt, dueTimeKnown: existing.dueTimeKnown, endsAt: previous.endsAt }
      : input.dueTime
        ? schoolWhen({ date: input.dueDate, time: input.dueTime, endTime: input.endTime, timezone })
        : movedSchoolWhen(existing, input.dueDate, timezone);
    await updateSchoolItem(supabase, householdId, existing.id, when);
    return { routedTable: "school_items", routedId: existing.id, changeType: "updated", previous, domain: "school_item" };
  }
  if (input.kind === "bill") {
    const existing = (await listObligations(supabase, householdId)).find((bill) => bill.id === input.existingId);
    if (!existing) throw new Error("existing bill not found");
    const previous = { dueOn: existing.dueOn, amountMinor: existing.amountMinor, status: existing.status };
    if (input.decision === "cancel") {
      await cancelObligation(supabase, { id: existing.id, householdId });
      return { routedTable: "obligations", routedId: existing.id, changeType: "cancelled", previous, domain: "bill" };
    }
    await updateObligation(supabase, {
      id: existing.id,
      householdId,
      dueOn: input.dueDate || existing.dueOn,
      amountMinor: input.amount ? Math.round(Number(input.amount) * 100) : existing.amountMinor,
    });
    return { routedTable: "obligations", routedId: existing.id, changeType: "updated", previous, domain: "bill" };
  }
  throw new Error("only a bill or a school item can be updated or cancelled from HomeSend");
}

export async function addChildFromNotice(supabase: Supabase, input: RouteInput): Promise<{ memberId: string } | { error: string }> {
  if (!input.newChildName) return { error: "What is the child's name?" };
  let actor: Membership;
  try {
    actor = await requireHouseholdAdmin(supabase, input.householdId);
  } catch {
    return { error: "Only an Admin can add a child. Ask one to add them from Family, then confirm this for them." };
  }
  try {
    const added = await createChildMember(supabase, {
      householdId: input.householdId,
      displayName: input.newChildName,
      dateOfBirth: input.newChildDob || null,
      guardianMemberIds: [actor.memberId],
    });
    revalidatePath("/family");
    revalidatePath("/school");
    return added;
  } catch (thrown) {
    log.warn("adding a child from a school notice failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return { error: "We could not add that child. Nothing was saved — please try again." };
  }
}

export async function createNew(supabase: Supabase, membership: Membership, input: RouteInput): Promise<{ routedTable: string; routedId: string } | { error: string }> {
  const householdId = input.householdId;
  if (input.kind === "bill") {
    const created = await createObligation(supabase, {
      householdId,
      name: input.title,
      kind: input.billKind ?? "other",
      payee: input.payee || null,
      amountMinor: input.amount ? Math.round(Number(input.amount) * 100) : null,
      currency: input.currency || null,
      dueOn: input.dueDate || null,
    });
    return { routedTable: "obligations", routedId: created.id };
  }
  if (input.kind === "school_item") {
    if (!input.childMemberId) return { error: "Choose who this is for." };
    const created = await createSchoolItem(supabase, {
      householdId,
      childMemberId: input.childMemberId,
      kind: input.schoolKind ?? "homework",
      title: input.title,
      subject: input.subject || null,
      detail: input.notes || null,
      ...schoolWhen({ date: input.dueDate, time: input.dueTime, endTime: input.endTime, timezone: membership.household.timezone }),
      estimatedMinutes: null,
    });
    return { routedTable: "school_items", routedId: created.id };
  }
  if (input.kind === "health_document") {
    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    // No selection means "for me" — the extracted subjectMemberName is a
    // hint the confirm screen shows, never something trusted to pick an
    // identity on its own; RLS is what actually decides whether this
    // member (self, or a child the actor guards) is one they may file for.
    const subjectMemberId = input.subjectMemberId || membership.memberId;

    let filePath: string | null = null;
    const item = await getHomeSendItem(supabase, householdId, input.itemId);
    if (item?.filePath) {
      const { data: downloaded, error: downloadError } = await supabase.storage.from("home-send").download(item.filePath);
      if (downloadError) throw new Error(`home-send download failed: ${downloadError.message}`);
      const newPath = `${householdId}/${crypto.randomUUID()}`;
      const { error: uploadError } = await supabase.storage.from("health-records").upload(newPath, downloaded);
      if (uploadError) throw new Error(`health-records upload failed: ${uploadError.message}`);
      filePath = newPath;
    }

    const created = await createRecord(supabase, { householdId, memberId: membership.memberId }, {
      memberId: subjectMemberId,
      label: input.title,
      recordType: input.healthRecordType ?? "other",
      documentDate: input.documentDate || null,
      filePath,
      notes: input.notes || null,
      privacyScope: "private",
      sourceType: "home_send_document",
    });
    return { routedTable: "health_records", routedId: created.id };
  }
  const created = await createConsumable(supabase, {
    householdId,
    name: input.title,
    category: input.category || CONSUMABLE_CATEGORIES[0],
    unit: input.unit || "unit",
    typicalQuantity: input.quantity ? Number(input.quantity) : 1,
  });
  return { routedTable: "consumables", routedId: created.id };
}

