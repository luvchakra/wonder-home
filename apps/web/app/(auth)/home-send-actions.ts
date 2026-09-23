"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { OBLIGATION_KINDS } from "@wonderhome/core/finance/payments";
import { cancelObligation, createObligation } from "@wonderhome/core/finance/repository";
import { CONSUMABLE_CATEGORIES } from "@wonderhome/core/commerce/consumables";
import { createConsumable, retireConsumable } from "@wonderhome/core/commerce/repository";
import { createClient } from "@wonderhome/core/db/server";
import { archiveRecord, createRecord, RECORD_TYPES } from "@wonderhome/core/health/records";
import { getHomeSendChange, hasActiveHomeSendChanges, recordHomeSendChange, undoHomeSendChange } from "@wonderhome/core/homesend/changes";
import type { HomeSendExtraction, HomeSendItem, HomeSendKind } from "@wonderhome/core/homesend/items";
import { reconcileHomeSend, type HomeSendReconciliation } from "@wonderhome/core/homesend/reconcile";
import { confirmTranscript, ingestFile, ingestText, IngestRejected, type IngestOutcome, type IngestState } from "@wonderhome/core/homesend/ingest";
import { dismissHomeSendItem, getHomeSendItem, markHomeSendUndone, routeHomeSendItem } from "@wonderhome/core/homesend/repository";
import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
import { requireMembership } from "@wonderhome/core/identity/households";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { cancelSchoolItem, createSchoolItem } from "@wonderhome/core/school/repository";

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
  item?: {
    id: string;
    classifiedKind: HomeSendKind;
    extracted: HomeSendExtraction | null;
    understanding?: IntakeUnderstanding | null;
    reconciliation?: Pick<HomeSendReconciliation, "verdict" | "message"> | null;
  };
};

/**
 * What was just understood, checked against what the household already has
 * (Wave 1 §7) — so the confirm step can say "this looks like the
 * electricity bill already on record" before anyone presses Add.
 */
async function withReconciliation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  timezone: string,
  state: SendHomeItemState,
): Promise<SendHomeItemState> {
  const item = state.item;
  const kind = item?.classifiedKind;
  if (!item || !kind || kind === "unknown" || !item.extracted?.title) return state;
  const found = await reconcileHomeSend(
    supabase,
    householdId,
    {
      kind,
      title: item.extracted.title,
      date: item.extracted.dueDate ?? item.extracted.documentDate ?? null,
      amount: item.extracted.amount,
      payee: item.extracted.payee,
      capturedAt: new Date().toISOString(),
    },
    { timezone },
  ).catch(() => null);
  return found ? { ...state, item: { ...item, reconciliation: { verdict: found.verdict, message: found.message } } } : state;
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
    const outcome = await ingestFile(
      supabase,
      { householdId, memberId: membership.memberId },
      { bytes: new Uint8Array(await file.arrayBuffer()), claimedType: file.type, filename: file.name || null },
    );
    const state = await withReconciliation(supabase, householdId, membership.household.timezone, toState(outcome));
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
    const outcome = await ingestText(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, { text: parsed.data.text });
    const state = await withReconciliation(supabase, parsed.data.householdId, membership.household.timezone, toState(outcome));
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
    const state = await withReconciliation(supabase, parsed.data.householdId, membership.household.timezone, toState(outcome));
    revalidateHomeSend();
    return state;
  } catch (thrown) {
    if (thrown instanceof IngestRejected) return { error: thrown.message };
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

const routeSchema = z.object({
  householdId: z.uuid(),
  itemId: z.uuid(),
  kind: z.enum(["bill", "school_item", "grocery_item", "health_document"]),
  title: z.string().trim().min(1, { error: "What is it?" }).max(160),
  notes: z.string().trim().max(2000).optional(),
  // bill
  billKind: z.enum(OBLIGATION_KINDS).optional(),
  payee: z.string().trim().max(120).optional(),
  amount: z.union([z.coerce.number().min(0).max(10_000_000), z.literal("")]).optional(),
  currency: z.string().trim().max(8).optional(),
  dueDate: z.string().optional(),
  // school
  childMemberId: z.uuid().optional(),
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
  // secondary: a second, different-domain need the same content also implies
  // (always a grocery suggestion — see ai/classify-intake.ts). Optional and
  // only ever written when the household explicitly ticks the box for it.
  // No notes field: createConsumable has nowhere to put one.
  includeSecondary: z.literal("on").optional(),
  secondaryTitle: z.string().trim().max(160).optional(),
  // Set once the person has seen a reconciliation candidate and said this
  // really is a different one.
  confirmDuplicate: z.literal("on").optional(),
});

/**
 * The confirm step's own submit: writes into the real domain table via that
 * domain's already-governed create function, then marks the intake item
 * routed. Nothing before this point ever wrote a bill, school item or
 * grocery row — this is the one place that does, and only once a person has
 * reviewed the fields.
 */
export type RouteHomeItemState = { error?: string; notice?: string; reconciliation?: Pick<HomeSendReconciliation, "verdict" | "message"> };

export async function routeHomeSendItemAction(_previous: RouteHomeItemState, formData: FormData): Promise<RouteHomeItemState> {
  const parsed = routeSchema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    billKind: formData.get("billKind") || undefined,
    payee: formData.get("payee") || undefined,
    amount: formData.get("amount") || undefined,
    currency: formData.get("currency") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    childMemberId: formData.get("childMemberId") || undefined,
    schoolKind: formData.get("schoolKind") || undefined,
    subject: formData.get("subject") || undefined,
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
    category: formData.get("category") || undefined,
    subjectMemberId: formData.get("subjectMemberId") || undefined,
    healthRecordType: formData.get("healthRecordType") || undefined,
    documentDate: formData.get("documentDate") || undefined,
    includeSecondary: formData.get("includeSecondary") || undefined,
    secondaryTitle: formData.get("secondaryTitle") || undefined,
    secondaryNotes: formData.get("secondaryNotes") || undefined,
    confirmDuplicate: formData.get("confirmDuplicate") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    // Never a quiet second copy (Wave 1 §7): if this is already on record,
    // or looks like newer details for something that is, the person sees
    // which record and decides — nothing is written until they say it is a
    // different one.
    if (parsed.data.confirmDuplicate !== "on") {
      const intake = await getHomeSendItem(supabase, parsed.data.householdId, parsed.data.itemId).catch(() => null);
      const found = await reconcileHomeSend(
        supabase,
        parsed.data.householdId,
        {
          kind: parsed.data.kind,
          title: parsed.data.title,
          date: parsed.data.kind === "health_document" ? parsed.data.documentDate || null : parsed.data.dueDate || null,
          amount: parsed.data.amount ? Number(parsed.data.amount) : null,
          payee: parsed.data.payee || null,
          subjectMemberId: parsed.data.kind === "school_item" ? parsed.data.childMemberId || null : parsed.data.kind === "health_document" ? parsed.data.subjectMemberId || null : null,
          capturedAt: intake?.createdAt ?? null,
        },
        { timezone: membership.household.timezone },
      ).catch(() => null);
      if (found) return { reconciliation: { verdict: found.verdict, message: found.message } };
    }

    let routedTable: string;
    let routedId: string;

    if (parsed.data.kind === "bill") {
      const created = await createObligation(supabase, {
        householdId: parsed.data.householdId,
        name: parsed.data.title,
        kind: parsed.data.billKind ?? "other",
        payee: parsed.data.payee || null,
        amountMinor: parsed.data.amount ? Math.round(Number(parsed.data.amount) * 100) : null,
        currency: parsed.data.currency || null,
        dueOn: parsed.data.dueDate || null,
      });
      routedTable = "obligations";
      routedId = created.id;
    } else if (parsed.data.kind === "school_item") {
      if (!parsed.data.childMemberId) return { error: "Choose who this is for." };
      const created = await createSchoolItem(supabase, {
        householdId: parsed.data.householdId,
        childMemberId: parsed.data.childMemberId,
        kind: parsed.data.schoolKind ?? "homework",
        title: parsed.data.title,
        subject: parsed.data.subject || null,
        detail: parsed.data.notes || null,
        dueAt: parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString() : null,
        estimatedMinutes: null,
      });
      routedTable = "school_items";
      routedId = created.id;
    } else if (parsed.data.kind === "health_document") {
      const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
      if (!entitlement.allowed) return { error: entitlement.reason };

      // No selection means "for me" — the extracted subjectMemberName is a
      // hint the confirm screen shows, never something trusted to pick an
      // identity on its own; RLS is what actually decides whether this
      // member (self, or a child the actor guards) is one they may file for.
      const subjectMemberId = parsed.data.subjectMemberId || membership.memberId;

      let filePath: string | null = null;
      const item = await getHomeSendItem(supabase, parsed.data.householdId, parsed.data.itemId);
      if (item?.filePath) {
        const { data: downloaded, error: downloadError } = await supabase.storage.from("home-send").download(item.filePath);
        if (downloadError) throw new Error(`home-send download failed: ${downloadError.message}`);
        const newPath = `${parsed.data.householdId}/${crypto.randomUUID()}`;
        const { error: uploadError } = await supabase.storage.from("health-records").upload(newPath, downloaded);
        if (uploadError) throw new Error(`health-records upload failed: ${uploadError.message}`);
        filePath = newPath;
      }

      const created = await createRecord(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
        memberId: subjectMemberId,
        label: parsed.data.title,
        recordType: parsed.data.healthRecordType ?? "other",
        documentDate: parsed.data.documentDate || null,
        filePath,
        notes: parsed.data.notes || null,
        privacyScope: "private",
        sourceType: "home_send_document",
      });
      routedTable = "health_records";
      routedId = created.id;
    } else {
      const created = await createConsumable(supabase, {
        householdId: parsed.data.householdId,
        name: parsed.data.title,
        category: parsed.data.category || CONSUMABLE_CATEGORIES[0],
        unit: parsed.data.unit || "unit",
        typicalQuantity: parsed.data.quantity ? Number(parsed.data.quantity) : 1,
      });
      routedTable = "consumables";
      routedId = created.id;
    }

    await routeHomeSendItem(supabase, parsed.data.householdId, parsed.data.itemId, { routedTable, routedId });
    await recordHomeSendChange(supabase, {
      householdId: parsed.data.householdId,
      intakeId: parsed.data.itemId,
      domain: parsed.data.kind,
      entityId: routedId,
      createdByMemberId: membership.memberId,
    });

    // A second, different-domain need the same content also implied — a
    // school notice that also asks for a specific item, say. Only ever a
    // grocery suggestion, and only ever written once the household ticks
    // the box for it too (never auto-added alongside the primary).
    if (parsed.data.kind !== "grocery_item" && parsed.data.includeSecondary === "on" && parsed.data.secondaryTitle) {
      const secondaryConsumable = await createConsumable(supabase, {
        householdId: parsed.data.householdId,
        name: parsed.data.secondaryTitle,
        category: CONSUMABLE_CATEGORIES[0],
        unit: "unit",
        typicalQuantity: 1,
      });
      await recordHomeSendChange(supabase, {
        householdId: parsed.data.householdId,
        intakeId: parsed.data.itemId,
        domain: "grocery_item",
        entityId: secondaryConsumable.id,
        createdByMemberId: membership.memberId,
      });
    }

    revalidatePath("/ai");
    revalidatePath("/home-send");
    revalidatePath("/bills");
    revalidatePath("/school");
    revalidatePath("/groceries");
    revalidatePath("/health");
    return { notice: "Added. WonderHome will track it from here." };
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

const undoSchema = z.object({ householdId: z.uuid(), changeId: z.uuid() });

/** Undoing having sent something in (CLAUDE.md rule 12): reverses the one write routing made, through the same domain service a manual remove would use. */
export async function undoHomeSendChangeAction(_previous: RouteHomeItemState, formData: FormData): Promise<RouteHomeItemState> {
  const parsed = undoSchema.safeParse({ householdId: formData.get("householdId"), changeId: formData.get("changeId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const change = await getHomeSendChange(supabase, parsed.data.householdId, parsed.data.changeId);
    if (!change) return { error: "That is not part of this household." };
    if (change.undoneAt) return { error: "Already undone." };

    if (change.domain === "bill") {
      await cancelObligation(supabase, { id: change.entityId, householdId: parsed.data.householdId });
    } else if (change.domain === "school_item") {
      await cancelSchoolItem(supabase, parsed.data.householdId, change.entityId);
    } else if (change.domain === "health_document") {
      await archiveRecord(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, change.entityId);
    } else {
      await retireConsumable(supabase, { id: change.entityId, householdId: parsed.data.householdId });
    }

    await undoHomeSendChange(supabase, parsed.data.householdId, change.id, membership.memberId);

    // An intake with a secondary alongside its primary is not fully undone
    // until both are — undoing one of two leaves the other genuinely live.
    const stillActive = await hasActiveHomeSendChanges(supabase, parsed.data.householdId, change.intakeId);
    if (!stillActive) await markHomeSendUndone(supabase, parsed.data.householdId, change.intakeId);

    revalidatePath("/ai");
    revalidatePath("/home-send");
    revalidatePath("/bills");
    revalidatePath("/school");
    revalidatePath("/groceries");
    revalidatePath("/health");
    return { notice: "Undone. WonderHome forgot it again." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

export type { HomeSendItem };
