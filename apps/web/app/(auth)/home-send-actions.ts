"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { cancelObligation, restoreObligation, updateObligation } from "@wonderhome/core/finance/repository";
import { CONSUMABLE_CATEGORIES } from "@wonderhome/core/commerce/consumables";
import { createConsumable, listConsumables, recordPurchase, removePurchase, retireConsumable } from "@wonderhome/core/commerce/repository";
import { currencyCode, unitCostMinor } from "@wonderhome/core/commerce/receipts";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { homesendCorrectionEvidence, recordCorrectionEvidence } from "@wonderhome/core/evaluation/evidence";
import { archiveRecord } from "@wonderhome/core/health/records";
import { getHomeSendChange, hasActiveHomeSendChanges, listHomeSendChanges, recordHomeSendChange, undoHomeSendChange } from "@wonderhome/core/homesend/changes";
import type { ConfirmationDecision } from "@wonderhome/core/homesend/confirmation";
import type { DocumentPlan } from "@wonderhome/core/homesend/plan";
import { type HomeSendChange, type HomeSendExtraction, type HomeSendItem, type HomeSendKind, type HomeSendReviewOutcome } from "@wonderhome/core/homesend/items";
import { reconcileHomeSend, type HomeSendReconciliation } from "@wonderhome/core/homesend/reconcile";
import type { SubjectResolution } from "@wonderhome/core/homesend/resolve";
import { confirmTranscript, ingestFile, ingestText, IngestRejected, type IngestOutcome, type IngestState } from "@wonderhome/core/homesend/ingest";
import { dismissHomeSendItem, getHomeSendItem, markHomeSendUndone, routeHomeSendItem } from "@wonderhome/core/homesend/repository";
import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { cancelSchoolItem, restoreSchoolItem, updateSchoolItem } from "@wonderhome/core/school/repository";

import { prepareReview } from "./home-send-review";
import { addChildFromNotice, createNew, reviseExisting, routeSchema, type RouteInput } from "./home-send-writes";

/**
 * HomeSend's entry points (Wave 3): upload a photo, PDF, text file or voice
 * note, or paste a message or a link. Each goes through the one pipeline in
 * `homesend/ingest.ts` — secure intake, normalize, understand — and every
 * one ends in the same confirm step: nothing is written into a domain table
 * until a person has reviewed it, the same shape `school-actions.ts`'s
 * screenshot import has always had.
 */

export type SendHomeItemState = {
  error?: string;
  notice?: string;
  /** What happens next: review it, check a transcript, or it failed safely. */
  state?: IngestState;
  duplicate?: boolean;
  heard?: IngestOutcome["heard"];
  /**
   * Set when the household's own autonomy setting let WonderHome apply this
   * without asking (§12) — shown as done, with its Undo, not as a review.
   */
  autoApplied?: { changeId: string; title: string; where: string };
  item?: {
    id: string;
    classifiedKind: HomeSendKind;
    extracted: HomeSendExtraction | null;
    understanding?: IntakeUnderstanding | null;
    reconciliation?: HomeSendReconciliation | null;
    /** Who it is for, resolved through the household's own people (§9). */
    subject?: SubjectResolution | null;
    /** How it is confirmed (§12): the reason, or the one question, the review opens with. */
    confirmation?: ConfirmationDecision | null;
    /** A document with several records, as its change plan (DDU 2.0). */
    plan?: DocumentPlan | null;
  };
};

/**
 * What was just understood, made ready for review (Wave 3 §9, §10): who it
 * is for, and whether it is already on record — so the confirm step can say
 * "I found Asmi's existing Science Exhibition for 28 Sep" before anyone
 * presses Add.
 */
async function withReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  membership: Awaited<ReturnType<typeof requireMembership>>,
  state: SendHomeItemState,
): Promise<SendHomeItemState> {
  const item = state.item;
  if (!item) return state;
  const review = await prepareReview(supabase, membership, {
    classifiedKind: item.classifiedKind,
    extracted: item.extracted,
    understanding: item.understanding ?? null,
    // Sent in by this member, just now.
    createdByMemberId: membership.memberId,
  }).catch(() => null);
  if (!review) return state;
  // Something already waiting is shown again, never applied a second time.
  if (review.confirmation.mode === "auto_apply" && !state.duplicate && !review.plan) {
    const applied = await autoApply(supabase, membership, { id: item.id, kind: item.classifiedKind, extracted: item.extracted, subject: review.subject }).catch(() => null);
    if (applied) return { notice: `${applied.title} — added to ${applied.where} on its own. ${review.confirmation.reason}`, autoApplied: applied };
  }
  return {
    ...state,
    item: { ...item, understanding: review.understanding, reconciliation: review.reconciliation, subject: review.subject, confirmation: review.confirmation, plan: review.plan ?? null },
  };
}

/**
 * Applying an item the household's own autonomy setting allows (§12): the
 * same governed create a person's confirm uses, recorded as a change with
 * the same Undo, and marked `auto_added` so it is never mistaken for a
 * person's decision (§19).
 */
async function autoApply(
  supabase: Awaited<ReturnType<typeof createClient>>,
  membership: Awaited<ReturnType<typeof requireMembership>>,
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
  });
  return { changeId: change.id, title, where: item.kind === "grocery_item" ? "Groceries" : "Kids & School" };
}

function toState(outcome: IngestOutcome): SendHomeItemState {
  return { notice: outcome.notice, state: outcome.state, duplicate: outcome.duplicate, heard: outcome.heard, item: outcome.item };
}

function revalidateHomeSend() {
  revalidatePath("/ai");
  revalidatePath("/home-send");
}

/**
 * What one upload form may send — the Server Action body limit in
 * `next.config.ts`, which sits under the hosting platform's own 4.5 MB
 * request ceiling. The pipeline has its own per-kind limits beyond this.
 */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** The upload half of sending something in: a photo, PDF, text file or voice note. */
export async function uploadHomeSendItemAction(_previous: SendHomeItemState, formData: FormData): Promise<SendHomeItemState> {
  const householdId = formData.get("householdId");
  if (typeof householdId !== "string") return { error: "Please try again." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo or file first." };
  if (file.size > UPLOAD_MAX_BYTES) return { error: "That file is too large — please use one under 4MB." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    if (!(await hitRateLimit(createAdminClient(), "homesend.intake", membership.memberId))) return { error: rateLimitMessage("homesend.intake") };
    const outcome = await ingestFile(
      supabase,
      { householdId, memberId: membership.memberId },
      { bytes: new Uint8Array(await file.arrayBuffer()), claimedType: file.type, filename: file.name || null },
    );
    const state = await withReview(supabase, membership, toState(outcome));
    revalidateHomeSend();
    return state;
  } catch (thrown) {
    if (thrown instanceof IngestRejected) return { error: thrown.message };
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/** The paste half: a forwarded message, or a link, typed or pasted as plain text. */
export async function pasteHomeSendItemAction(_previous: SendHomeItemState, formData: FormData): Promise<SendHomeItemState> {
  const parsed = z.object({ householdId: z.uuid(), text: z.string().trim().min(1, { error: "Paste something first." }).max(12000) }).safeParse({
    householdId: formData.get("householdId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const admin = createAdminClient();
    if (!(await hitRateLimit(admin, "homesend.intake", membership.memberId))) return { error: rateLimitMessage("homesend.intake") };
    const outcome = await ingestText(
      supabase,
      { householdId: parsed.data.householdId, memberId: membership.memberId },
      { text: parsed.data.text },
      { limit: (bucket) => hitRateLimit(admin, bucket, membership.memberId) },
    );
    const state = await withReview(supabase, membership, toState(outcome));
    revalidateHomeSend();
    return state;
  } catch (thrown) {
    if (thrown instanceof IngestRejected) return { error: thrown.message };
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/**
 * A voice note WonderHome was not sure it heard right (§17): the household
 * confirms the transcript or types what was said, and only then is it read.
 */
export async function confirmTranscriptAction(_previous: SendHomeItemState, formData: FormData): Promise<SendHomeItemState> {
  const parsed = z
    .object({ householdId: z.uuid(), itemId: z.uuid(), text: z.string().trim().min(1, { error: "Type what the voice note said first." }).max(4000) })
    .safeParse({ householdId: formData.get("householdId"), itemId: formData.get("itemId"), text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const item = await getHomeSendItem(supabase, parsed.data.householdId, parsed.data.itemId);
    if (!item || item.source !== "audio_note") return { error: "That voice note is not part of this household." };
    if (item.status !== "received" && item.status !== "classified") return { error: "That voice note has already been handled." };
    const outcome = await confirmTranscript(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, { itemId: item.id, text: parsed.data.text });
    const state = await withReview(supabase, membership, toState(outcome));
    revalidateHomeSend();
    return state;
  } catch (thrown) {
    if (thrown instanceof IngestRejected) return { error: thrown.message };
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/**
 * The confirm step's own submit: writes into the real domain table via that
 * domain's already-governed service, then marks the intake item routed.
 * Nothing before this point ever wrote a bill, school item or grocery row —
 * this is the one place that does, and only once a person has reviewed it.
 */
export type RouteHomeItemState = { error?: string; notice?: string; reconciliation?: HomeSendReconciliation };

function revalidateDomains() {
  revalidatePath("/ai");
  revalidatePath("/home-send");
  revalidatePath("/bills");
  revalidatePath("/school");
  revalidatePath("/groceries");
  revalidatePath("/health");
}

/**
 * Whether the person changed what WonderHome read before confirming it
 * (§19's correction rate): the kind, the name, a date, an amount or a
 * quantity. Null when there was no reading to compare against.
 */
function wasCorrected(intake: HomeSendItem | null, input: RouteInput): boolean | null {
  const read = intake?.extracted;
  if (!intake || !read) return null;
  const differs = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() !== String(b ?? "").trim().toLowerCase();
  if (intake.classifiedKind && intake.classifiedKind !== "unknown" && intake.classifiedKind !== input.kind) return true;
  if (differs(read.title, input.title)) return true;
  const date = input.kind === "health_document" ? input.documentDate : input.dueDate;
  const readDate = (input.kind === "health_document" ? read.documentDate : read.dueDate)?.slice(0, 10);
  if (differs(readDate, date)) return true;
  const number = (value: unknown) => (value === "" || value === undefined || value === null ? null : Number(value));
  if (input.kind === "bill" && number(read.amount) !== number(input.amount)) return true;
  if (input.kind === "grocery_item" && read.quantity != null && number(read.quantity) !== number(input.quantity)) return true;
  return false;
}

const receiptSchema = z.object({
  householdId: z.uuid(),
  itemId: z.uuid(),
  merchant: z.string().trim().max(120).optional(),
  purchasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "When was it bought?" }),
  currency: z.string().trim().max(8).optional(),
  lines: z
    .array(
      z.object({
        name: z.string().trim().min(1, { error: "Every line needs a name." }).max(120),
        quantity: z.union([z.coerce.number().positive().max(10_000), z.literal("")]),
        unit: z.string().trim().max(20),
        lineTotal: z.union([z.coerce.number().min(0).max(10_000_000), z.literal("")]),
        /** A tracked consumable's id, "new" to start tracking it, or "skip" to leave the line out. */
        match: z.union([z.uuid(), z.literal("new"), z.literal("skip")]),
      }),
    )
    .max(40),
});

/**
 * A receipt's own confirm (09-009): each line the person kept becomes one
 * purchase in `consumable_purchases`, against the tracked item it is — or a
 * new tracked item when they said so — and the item's history learns from
 * it. Every write is its own `homesend_changes` row, so each line (and each
 * item it started tracking) can be undone on its own. Nothing is paid and
 * nothing is ordered: a receipt is evidence, never a bill.
 */
async function routeReceipt(formData: FormData): Promise<RouteHomeItemState> {
  const column = (name: string) => formData.getAll(name).map((value) => (typeof value === "string" ? value : ""));
  const names = column("lineName");
  const quantities = column("lineQuantity");
  const units = column("lineUnit");
  const totals = column("lineTotal");
  const matches = column("lineMatch");
  const parsed = receiptSchema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    merchant: formData.get("merchant") || undefined,
    purchasedOn: formData.get("purchasedOn"),
    currency: formData.get("currency") || undefined,
    lines: names.map((name, index) => ({ name, quantity: quantities[index] ?? "", unit: units[index] ?? "", lineTotal: totals[index] ?? "", match: matches[index] || "skip" })),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the lines above." };
  const input = parsed.data;
  const kept = input.lines.filter((line) => line.match !== "skip");
  if (kept.length === 0) return { error: "Choose at least one line to record, or dismiss the receipt." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, input.householdId);
    const intake = await getHomeSendItem(supabase, input.householdId, input.itemId).catch(() => null);
    const tracked = await listConsumables(supabase, input.householdId);
    const byId = new Map(tracked.map((consumable) => [consumable.id, consumable]));
    const byName = new Map<string, { id: string }>(tracked.map((consumable) => [consumable.name.trim().toLowerCase(), { id: consumable.id }]));
    const currency = currencyCode(input.currency);
    const change = (domain: "grocery_item" | "purchase", entityId: string) =>
      recordHomeSendChange(supabase, { householdId: input.householdId, intakeId: input.itemId, domain, entityId, createdByMemberId: membership.memberId });

    let firstPurchase: string | null = null;
    let started = 0;
    for (const line of kept) {
      const quantity = line.quantity === "" ? 1 : line.quantity;
      let consumableId: string;
      if (line.match === "new") {
        // "New" never makes a second copy of something already tracked under
        // the same name — it records against that one instead.
        const same = byName.get(line.name.toLowerCase());
        if (same) {
          consumableId = same.id;
        } else {
          const created = await createConsumable(supabase, {
            householdId: input.householdId,
            name: line.name,
            category: CONSUMABLE_CATEGORIES[0],
            unit: line.unit || "unit",
            typicalQuantity: quantity,
          });
          consumableId = created.id;
          byName.set(line.name.toLowerCase(), { id: created.id });
          await change("grocery_item", created.id);
          started += 1;
        }
      } else {
        if (!byId.has(line.match)) return { error: `"${line.name}" was matched to something this household no longer tracks. Choose again.` };
        consumableId = line.match;
      }
      const purchase = await recordPurchase(supabase, {
        householdId: input.householdId,
        consumableId,
        purchasedOn: input.purchasedOn,
        quantity,
        unitCostMinor: unitCostMinor(line.lineTotal === "" ? null : line.lineTotal, quantity, currency),
        currency,
        merchant: input.merchant ?? null,
      });
      firstPurchase ??= purchase.id;
      await change("purchase", purchase.id);
    }

    const read = intake?.extracted?.lines ?? [];
    const corrected = intake?.extracted
      ? kept.length !== read.length || kept.some((line, index) => line.name.trim().toLowerCase() !== (read[index]?.name ?? "").trim().toLowerCase())
      : null;
    await routeHomeSendItem(supabase, input.householdId, input.itemId, {
      routedTable: "consumable_purchases",
      routedId: firstPurchase!,
      review: { decision: "added", proposal: null, subject: null, corrected },
    });

    revalidateDomains();
    const where = input.merchant ? ` from ${input.merchant}` : "";
    const lines = kept.length === 1 ? "one purchase" : `${kept.length} purchases`;
    return { notice: `Recorded ${lines}${where}. Groceries learns from them.${started > 0 ? ` ${started === 1 ? "One new item is" : `${started} new items are`} now tracked.` : ""}` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

export async function routeHomeSendItemAction(_previous: RouteHomeItemState, formData: FormData): Promise<RouteHomeItemState> {
  if (formData.get("kind") === "receipt") return routeReceipt(formData);
  const parsed = routeSchema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    decision: formData.get("decision") || undefined,
    existingId: formData.get("existingId") || undefined,
    kind: formData.get("kind"),
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    billKind: formData.get("billKind") || undefined,
    payee: formData.get("payee") || undefined,
    amount: formData.get("amount") || undefined,
    currency: formData.get("currency") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    dueTime: formData.get("dueTime") ?? undefined,
    endTime: formData.get("endTime") ?? undefined,
    childMemberId: formData.get("childMemberId") || undefined,
    newChildName: formData.get("newChildName") || undefined,
    newChildDob: formData.get("newChildDob") ?? undefined,
    schoolKind: formData.get("schoolKind") || undefined,
    subject: formData.get("subject") || undefined,
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
    category: formData.get("category") || undefined,
    subjectMemberId: formData.get("subjectMemberId") || undefined,
    healthRecordType: formData.get("healthRecordType") || undefined,
    documentDate: formData.get("documentDate") || undefined,
    needs: formData.getAll("need").filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    confirmDuplicate: formData.get("confirmDuplicate") || undefined,
    proposal: formData.get("proposal") || undefined,
    subjectState: formData.get("subjectState") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const input = parsed.data;

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, input.householdId);
    const intake = await getHomeSendItem(supabase, input.householdId, input.itemId).catch(() => null);
    const review = (decision: HomeSendReviewOutcome["decision"]): HomeSendReviewOutcome => ({
      decision,
      proposal: input.proposal ?? null,
      subject: input.subjectState ?? null,
      corrected: decision === "kept_existing" ? null : wasCorrected(intake, input),
    });

    // "Keep existing" (§13): the record on file stands and nothing is
    // written; the intake is set aside as handled.
    if (input.decision === "keep") {
      await dismissHomeSendItem(supabase, input.householdId, input.itemId, membership.memberId, review("kept_existing"));
      revalidateDomains();
      return { notice: "Kept the existing one — nothing changed." };
    }

    let routedTable: string;
    let routedId: string;

    if (input.decision === "update" || input.decision === "cancel") {
      if (!input.existingId) return { error: "Please try again." };
      if (input.kind !== "bill" && input.kind !== "school_item") return { error: "Only a bill or school item can be updated from here." };
      const revised = await reviseExisting(supabase, membership, { ...input, existingId: input.existingId, decision: input.decision });
      routedTable = revised.routedTable;
      routedId = revised.routedId;
      await routeHomeSendItem(supabase, input.householdId, input.itemId, { routedTable, routedId, review: review(input.decision === "update" ? "updated" : "cancelled") });
      await recordHomeSendChange(supabase, {
        householdId: input.householdId,
        intakeId: input.itemId,
        domain: revised.domain,
        entityId: routedId,
        createdByMemberId: membership.memberId,
        changeType: revised.changeType,
        previous: revised.previous,
      });
    } else {
      // Never a quiet second copy (Wave 1 §7, Wave 3 §10): if this is
      // already on record, or looks like newer details for something that
      // is, the person sees which record and decides — nothing is written
      // until they say it is a different one.
      if (input.confirmDuplicate !== "on") {
        const found = await reconcileHomeSend(
          supabase,
          input.householdId,
          {
            kind: input.kind,
            title: input.title,
            date: input.kind === "health_document" ? input.documentDate || null : input.dueDate || null,
            amount: input.amount ? Number(input.amount) : null,
            payee: input.payee || null,
            subjectMemberId: input.kind === "school_item" ? (input.childMemberId && input.childMemberId !== "new" ? input.childMemberId : null) : input.kind === "health_document" ? input.subjectMemberId || null : null,
            capturedAt: intake?.createdAt ?? null,
            change: intake?.extracted?.change ?? "new",
          },
          { timezone: membership.household.timezone },
        ).catch(() => null);
        if (found) return { reconciliation: found };
      }

      // A child the notice names who is not on record yet (story 08-009):
      // added the way the Family screen adds one — an Admin, who becomes the
      // child's guardian — and the notice is confirmed for them straight after.
      if (input.kind === "school_item" && input.childMemberId === "new") {
        const added = await addChildFromNotice(supabase, input);
        if ("error" in added) return { error: added.error };
        input.childMemberId = added.memberId;
      }

      const created = await createNew(supabase, membership, input);
      if ("error" in created) return { error: created.error };
      routedTable = created.routedTable;
      routedId = created.routedId;
      await routeHomeSendItem(supabase, input.householdId, input.itemId, { routedTable, routedId, review: review("added") });
      await recordHomeSendChange(supabase, {
        householdId: input.householdId,
        intakeId: input.itemId,
        domain: input.kind,
        entityId: routedId,
        createdByMemberId: membership.memberId,
      });
    }

    // What else the same content asked for (§11) — each ticked need its own
    // grocery row and its own change, so each can be undone on its own.
    let needsAdded = 0;
    if (input.kind !== "grocery_item") {
      for (const title of [...new Set(input.needs)]) {
        const consumable = await createConsumable(supabase, {
          householdId: input.householdId,
          name: title,
          category: CONSUMABLE_CATEGORIES[0],
          unit: "unit",
          typicalQuantity: 1,
        });
        await recordHomeSendChange(supabase, {
          householdId: input.householdId,
          intakeId: input.itemId,
          domain: "grocery_item",
          entityId: consumable.id,
          createdByMemberId: membership.memberId,
        });
        needsAdded += 1;
      }
    }

    // What the person fixed before confirming is evaluation evidence (Wave 5
    // §13): kept append-only, best-effort, never at the cost of the review.
    if (intake?.extracted) {
      const read = intake.extracted;
      const number = (value: unknown) => (value === "" || value === undefined || value === null ? null : Number(value));
      const evidence = homesendCorrectionEvidence(
        { kind: intake.classifiedKind, title: read.title, date: (input.kind === "health_document" ? read.documentDate : read.dueDate) ?? null, amount: number(read.amount), quantity: number(read.quantity) },
        { kind: input.kind, title: input.title, date: (input.kind === "health_document" ? input.documentDate : input.dueDate) || null, amount: number(input.amount), quantity: number(input.quantity) },
      );
      await recordCorrectionEvidence(createAdminClient(), {
        householdId: input.householdId,
        surface: "homesend",
        sourceType: "home_send_item",
        sourceId: input.itemId,
        memberId: membership.memberId,
        evidence,
      }).catch((error) => log.warn("correction evidence not recorded", { reason: error instanceof Error ? error.message : "unknown" }));
    }

    revalidateDomains();
    const main =
      input.decision === "update"
        ? "Updated the existing one."
        : input.decision === "cancel"
          ? "Cancelled the existing one."
          : "Added. WonderHome will track it from here.";
    return { notice: needsAdded > 0 ? `${main} ${needsAdded === 1 ? "One thing" : `${needsAdded} things`} added to Groceries too.` : main };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

const dismissSchema = z.object({ householdId: z.uuid(), itemId: z.uuid() });

/** The other half of sending something in (rule 12): saying it was not worth acting on. */
export async function dismissHomeSendItemAction(_previous: RouteHomeItemState, formData: FormData): Promise<RouteHomeItemState> {
  const parsed = dismissSchema.safeParse({ householdId: formData.get("householdId"), itemId: formData.get("itemId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await dismissHomeSendItem(supabase, parsed.data.householdId, parsed.data.itemId, membership.memberId);
    revalidatePath("/ai");
    revalidatePath("/home-send");
    return { notice: "Dismissed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/**
 * Reverses one recorded change through the same domain service a manual
 * edit or remove would use: removes what it created, or puts back what it
 * updated or cancelled (rule 12, Wave 3 §10, DDU 2.0 §26).
 */
async function reverseChange(supabase: Awaited<ReturnType<typeof createClient>>, householdId: string, memberId: string, change: HomeSendChange): Promise<void> {
  const previous = change.previous ?? {};

  if (change.changeType === "updated") {
    if (change.domain === "school_item") {
      const dueAt = (previous.dueAt as string | null | undefined) ?? null;
      // Changes recorded before 14-014 kept no time flag: read it the way a
      // portal's due date is read, midnight UTC being a day.
      const dueTimeKnown = typeof previous.dueTimeKnown === "boolean" ? previous.dueTimeKnown : Boolean(dueAt && !dueAt.includes("T00:00:00"));
      await updateSchoolItem(supabase, householdId, change.entityId, { dueAt, dueTimeKnown, endsAt: (previous.endsAt as string | null | undefined) ?? null });
    } else if (change.domain === "bill") {
      await updateObligation(supabase, {
        id: change.entityId,
        householdId,
        dueOn: (previous.dueOn as string | null | undefined) ?? null,
        amountMinor: (previous.amountMinor as number | null | undefined) ?? null,
      });
    }
  } else if (change.changeType === "cancelled") {
    const status = typeof previous.status === "string" ? previous.status : null;
    if (change.domain === "school_item") {
      await restoreSchoolItem(supabase, householdId, change.entityId, (status && status !== "cancelled" ? status : "pending") as "pending");
    } else if (change.domain === "bill") {
      await restoreObligation(supabase, { id: change.entityId, householdId, status: status && status !== "cancelled" ? status : "expected" });
    }
  } else if (change.domain === "bill") {
    await cancelObligation(supabase, { id: change.entityId, householdId });
  } else if (change.domain === "school_item") {
    await cancelSchoolItem(supabase, householdId, change.entityId);
  } else if (change.domain === "purchase") {
    // A recorded purchase goes, and the item's history is what the
    // remaining purchases say (09-009).
    await removePurchase(supabase, { householdId, purchaseId: change.entityId });
  } else if (change.domain === "health_document") {
    await archiveRecord(supabase, { householdId, memberId: memberId }, change.entityId);
  } else {
    await retireConsumable(supabase, { id: change.entityId, householdId });
  }
}

const undoSchema = z.object({ householdId: z.uuid(), changeId: z.uuid() });

/**
 * Undoing what sending something in did (CLAUDE.md rule 12, Wave 3 §10):
 * reverses exactly the one change — removes what it created, or puts back
 * what it updated or cancelled — through the same domain service a manual
 * edit or remove would use.
 */
export async function undoHomeSendChangeAction(_previous: RouteHomeItemState, formData: FormData): Promise<RouteHomeItemState> {
  const parsed = undoSchema.safeParse({ householdId: formData.get("householdId"), changeId: formData.get("changeId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const householdId = parsed.data.householdId;

    const change = await getHomeSendChange(supabase, householdId, parsed.data.changeId);
    if (!change) return { error: "That is not part of this household." };
    if (change.undoneAt) return { error: "Already undone." };
    await reverseChange(supabase, householdId, membership.memberId, change);

    await undoHomeSendChange(supabase, householdId, change.id, membership.memberId);

    // An intake with needs alongside its primary is not fully undone until
    // all of them are — undoing one leaves the others genuinely live.
    const stillActive = await hasActiveHomeSendChanges(supabase, householdId, change.intakeId);
    if (!stillActive) await markHomeSendUndone(supabase, householdId, change.intakeId);

    revalidateDomains();
    return { notice: change.changeType === "created" ? "Undone. WonderHome forgot it again." : "Undone. The record is back the way it was." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

const undoDocumentSchema = z.object({ householdId: z.uuid(), itemId: z.uuid() });

/**
 * Undo everything a document did (DDU 2.0 §26): each of its live changes,
 * newest first, through its own domain service. What cannot be reversed is
 * said, and the rest is still undone — never all-or-nothing silence.
 */
export async function undoHomeSendDocumentAction(_previous: RouteHomeItemState, formData: FormData): Promise<RouteHomeItemState> {
  const parsed = undoDocumentSchema.safeParse({ householdId: formData.get("householdId"), itemId: formData.get("itemId") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const householdId = parsed.data.householdId;
    const live = (await listHomeSendChanges(supabase, householdId)).filter((change) => change.intakeId === parsed.data.itemId && !change.undoneAt);
    if (live.length === 0) return { error: "Nothing from this is left to undo." };
    let undone = 0;
    for (const change of live) {
      try {
        await reverseChange(supabase, householdId, membership.memberId, change);
        await undoHomeSendChange(supabase, householdId, change.id, membership.memberId);
        undone += 1;
      } catch (thrown) {
        log.warn("undoing a document change failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
      }
    }
    if (!(await hasActiveHomeSendChanges(supabase, householdId, parsed.data.itemId))) await markHomeSendUndone(supabase, householdId, parsed.data.itemId);
    revalidateDomains();
    if (undone === live.length) return { notice: `Undone — ${undone === 1 ? "the one change" : `all ${undone} changes`} from it.` };
    return { error: `Undid ${undone} of ${live.length}. The rest could not be undone here — change them on their own screens.` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

export type { HomeSendItem };

/** What a receipt's lines can be matched to (09-009): the household's own tracked items, names only. */
export async function trackedItemsAction(householdId: string): Promise<{ id: string; name: string }[]> {
  const parsed = z.uuid().safeParse(householdId);
  if (!parsed.success) return [];
  const supabase = await createClient();
  await requireMembership(supabase, parsed.data);
  const items = await listConsumables(supabase, parsed.data);
  return items.map((item) => ({ id: item.id, name: item.name }));
}
