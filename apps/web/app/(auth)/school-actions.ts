"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { cancelSchoolItem, createSchoolItem, updateSchoolItem } from "@wonderhome/core/school/repository";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { schoolWhen } from "@wonderhome/core/school/times";

import type { ActionState } from "./actions";

/**
 * Adding a piece of school work by hand — the manual half of the promise the
 * Homework empty state already made ("add a piece of homework"), which had
 * no form behind it even though `createSchoolItem` already existed for the
 * API route the AI assistant calls.
 */
// A due date is what lets Overview group anything into "this week"/"next
// week" — required for every kind except a notice, which is a plain FYI
// with no deadline of its own to invent (rule 9: never show a date with no
// source).
const schema = z
  .object({
    householdId: z.uuid(),
    childMemberId: z.uuid({ error: "Choose who this is for." }),
    kind: z.enum(SCHOOL_ITEM_KINDS),
    title: z.string().trim().min(1, { error: "What is it?" }).max(160),
    subject: z.string().trim().max(60).optional(),
    detail: z.string().trim().max(2000).optional(),
    dueAt: z.string().optional(),
    // A local start and end ("HH:MM"); empty means all day (14-014).
    dueTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
    endTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
    estimatedMinutes: z.union([z.coerce.number().int().min(1).max(600), z.literal("")]).optional(),
  })
  .refine((value) => value.kind === "notice" || Boolean(value.dueAt), {
    error: "When is it due?",
    path: ["dueAt"],
  });

export async function createSchoolItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    childMemberId: formData.get("childMemberId"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    subject: formData.get("subject") || undefined,
    detail: formData.get("detail") || undefined,
    dueAt: formData.get("dueAt") || undefined,
    dueTime: formData.get("dueTime") ?? undefined,
    endTime: formData.get("endTime") ?? undefined,
    estimatedMinutes: formData.get("estimatedMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await createSchoolItem(supabase, {
      householdId: parsed.data.householdId,
      childMemberId: parsed.data.childMemberId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      subject: parsed.data.subject || null,
      detail: parsed.data.detail || null,
      ...schoolWhen({ date: parsed.data.dueAt, time: parsed.data.dueTime, endTime: parsed.data.endTime, timezone: membership.household.timezone }),
      estimatedMinutes: parsed.data.estimatedMinutes === "" ? null : parsed.data.estimatedMinutes,
    });

    revalidatePath("/school");
    return { notice: "Added. WonderHome will track it until it’s done." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "school").body.error.message };
  }
}

export type ExtractedSchoolItem = {
  title: string | null;
  kind: (typeof SCHOOL_ITEM_KINDS)[number] | null;
  subject: string | null;
  dueDate: string | null;
  notes: string | null;
};

export type ExtractSchoolItemState = ActionState & { extracted?: ExtractedSchoolItem };

const EXTRACT_MAX_BYTES = 8 * 1024 * 1024;
const EXTRACT_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * The screenshot half of adding homework: reads a photo through whichever
 * AI provider this household has configured and hands the result back as
 * prefill for the same manual form `createSchoolItemAction` already
 * submits — never writes a row itself, so a misread is caught by the
 * household reviewing the form before Add, not after.
 */
export async function extractSchoolItemFromPhotoAction(
  _previous: ExtractSchoolItemState,
  formData: FormData,
): Promise<ExtractSchoolItemState> {
  const householdId = formData.get("householdId");
  if (typeof householdId !== "string") return { error: "Please try again." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { error: "Choose a photo first." };
  if (!EXTRACT_CONTENT_TYPES.has(photo.type)) return { error: "Photos must be a JPEG, PNG or WebP image." };
  if (photo.size > EXTRACT_MAX_BYTES) return { error: "That photo is too large — please use one under 8MB." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const { readHouseholdKey } = await import("@wonderhome/core/ai/credentials");
    const { resolveModelKey, platformKey } = await import("@wonderhome/core/ai/model-key");
    const { extractSchoolItemFromImage } = await import("@wonderhome/core/ai/vision-extract");

    const householdKey = await readHouseholdKey(householdId).catch(() => null);
    const key = resolveModelKey(householdKey, platformKey());
    if (key.source === "none" || !key.provider || !key.key) {
      return { error: "No AI provider is set up for this household yet. Fill in the details below by hand, or set one up in Settings." };
    }

    const buffer = Buffer.from(await photo.arrayBuffer());
    const extraction = await extractSchoolItemFromImage(key.provider, key.key, {
      mediaType: photo.type as "image/jpeg" | "image/png" | "image/webp",
      base64: buffer.toString("base64"),
    });

    if (!extraction || !extraction.readable) {
      return { error: "Could not read that photo as school work. Please fill in the details below by hand." };
    }

    return {
      notice: "Filled in from the photo — check it over before adding.",
      extracted: {
        title: extraction.title,
        kind: extraction.kind,
        subject: extraction.subject,
        dueDate: extraction.dueDate,
        notes: extraction.notes,
      },
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "school").body.error.message };
  }
}

const updateSchema = z
  .object({
    householdId: z.uuid(),
    itemId: z.uuid(),
    childMemberId: z.uuid({ error: "Choose who this is for." }),
    kind: z.enum(SCHOOL_ITEM_KINDS),
    title: z.string().trim().min(1, { error: "What is it?" }).max(160),
    subject: z.string().trim().max(60).optional(),
    detail: z.string().trim().max(2000).optional(),
    dueAt: z.string().optional(),
    // A local start and end ("HH:MM"); empty means all day (14-014).
    dueTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
    endTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
    estimatedMinutes: z.union([z.coerce.number().int().min(1).max(600), z.literal("")]).optional(),
  })
  .refine((value) => value.kind === "notice" || Boolean(value.dueAt), {
    error: "When is it due?",
    path: ["dueAt"],
  });

/** The other half of `createSchoolItemAction`: correcting an entry after the fact (rule 12). */
export async function updateSchoolItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    childMemberId: formData.get("childMemberId"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    subject: formData.get("subject") || undefined,
    detail: formData.get("detail") || undefined,
    dueAt: formData.get("dueAt") || undefined,
    dueTime: formData.get("dueTime") ?? undefined,
    endTime: formData.get("endTime") ?? undefined,
    estimatedMinutes: formData.get("estimatedMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await updateSchoolItem(supabase, parsed.data.householdId, parsed.data.itemId, {
      childMemberId: parsed.data.childMemberId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      subject: parsed.data.subject || null,
      detail: parsed.data.detail || null,
      ...schoolWhen({ date: parsed.data.dueAt, time: parsed.data.dueTime, endTime: parsed.data.endTime, timezone: membership.household.timezone }),
      estimatedMinutes: parsed.data.estimatedMinutes === "" ? null : parsed.data.estimatedMinutes,
    });

    revalidatePath("/school");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "school").body.error.message };
  }
}

const cancelSchema = z.object({ householdId: z.uuid(), itemId: z.uuid() });

export async function cancelSchoolItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await cancelSchoolItem(supabase, parsed.data.householdId, parsed.data.itemId);

    revalidatePath("/school");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "school").body.error.message };
  }
}
