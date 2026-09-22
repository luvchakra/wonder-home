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
import { classifyAndSave } from "@wonderhome/core/homesend/classify-and-save";
import { getHomeSendChange, hasActiveHomeSendChanges, recordHomeSendChange, undoHomeSendChange } from "@wonderhome/core/homesend/changes";
import type { HomeSendExtraction, HomeSendItem, HomeSendKind } from "@wonderhome/core/homesend/items";
import { createHomeSendItem, dismissHomeSendItem, getHomeSendItem, markHomeSendUndone, routeHomeSendItem } from "@wonderhome/core/homesend/repository";
import { assessUploadSecurity } from "@wonderhome/core/homesend/security";
import { requireMembership } from "@wonderhome/core/identity/households";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { cancelSchoolItem, createSchoolItem } from "@wonderhome/core/school/repository";

/**
 * HomeSend v1 (Phase C): upload a photo/file, or paste a forwarded message,
 * classify it, and — once a person confirms — route it into the real domain
 * table. Every step here mirrors `school-actions.ts`'s screenshot-import
 * shape: classification only ever fills a confirm form, and the confirm
 * form's own submit is what writes anything. No real WhatsApp/email webhook
 * exists yet (no provider credentials, per CLAUDE.md) — `source` only names
 * the two channels that genuinely run today.
 */

export type SendHomeItemState = {
  error?: string;
  notice?: string;
  item?: { id: string; classifiedKind: HomeSendKind; extracted: HomeSendExtraction | null };
};

const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The upload half of sending something in: a photo or file. */
export async function uploadHomeSendItemAction(_previous: SendHomeItemState, formData: FormData): Promise<SendHomeItemState> {
  const householdId = formData.get("householdId");
  if (typeof householdId !== "string") return { error: "Please try again." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { error: "Choose a photo or file first." };
  if (!UPLOAD_CONTENT_TYPES.has(photo.type)) return { error: "Please send a JPEG, PNG or WebP image." };
  if (photo.size > UPLOAD_MAX_BYTES) return { error: "That file is too large — please use one under 8MB." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const buffer = Buffer.from(await photo.arrayBuffer());
    const securityStatus = await assessUploadSecurity(photo.type, buffer);

    const itemId = crypto.randomUUID();
    const path = `${householdId}/${itemId}`;
    // Stored either way — the private bucket is the quarantine. Only
    // classification is skipped for a rejected file, never the record that
    // it was sent (CLAUDE.md's "security failure -> quarantine; no AI").
    const { error: uploadError } = await supabase.storage.from("home-send").upload(path, photo, { contentType: photo.type });
    if (uploadError) throw new Error(`home-send upload failed: ${uploadError.message}`);

    await createHomeSendItem(supabase, {
      id: itemId,
      householdId,
      createdByMemberId: membership.memberId,
      source: "manual_upload",
      filePath: path,
      securityStatus,
    });

    if (securityStatus === "rejected") {
      revalidatePath("/ai");
      revalidatePath("/home-send");
      return {
        notice: "That file didn't read as a real image, so WonderHome kept it without looking inside — please try a different photo.",
        item: { id: itemId, classifiedKind: "unknown", extracted: null },
      };
    }

    const state = await classifyAndSave(supabase, householdId, itemId, {
      image: { mediaType: photo.type as "image/jpeg" | "image/png" | "image/webp", base64: buffer.toString("base64") },
    });
    revalidatePath("/ai");
    revalidatePath("/home-send");
    return state;
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/** The paste half: a forwarded message, typed or pasted as plain text. */
export async function pasteHomeSendItemAction(_previous: SendHomeItemState, formData: FormData): Promise<SendHomeItemState> {
  const parsed = z.object({ householdId: z.uuid(), text: z.string().trim().min(1, { error: "Paste something first." }).max(4000) }).safeParse({
    householdId: formData.get("householdId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const itemId = crypto.randomUUID();
    await createHomeSendItem(supabase, {
      id: itemId,
      householdId: parsed.data.householdId,
      createdByMemberId: membership.memberId,
      source: "pasted_text",
      rawText: parsed.data.text,
    });

    const state = await classifyAndSave(supabase, parsed.data.householdId, itemId, { text: parsed.data.text });
    revalidatePath("/ai");
    revalidatePath("/home-send");
    return state;
  } catch (thrown) {
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
});

/**
 * The confirm step's own submit: writes into the real domain table via that
 * domain's already-governed create function, then marks the intake item
 * routed. Nothing before this point ever wrote a bill, school item or
 * grocery row — this is the one place that does, and only once a person has
 * reviewed the fields.
 */
export type RouteHomeItemState = { error?: string; notice?: string };

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
    includeSecondary: formData.get("includeSecondary") || undefined,
    secondaryTitle: formData.get("secondaryTitle") || undefined,
    secondaryNotes: formData.get("secondaryNotes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

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
