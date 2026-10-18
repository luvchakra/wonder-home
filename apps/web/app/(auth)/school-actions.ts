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

const childSchoolSchema = z.object({ householdId: z.uuid(), childMemberId: z.uuid() });

/**
 * A child's school from Kids & School (story 24-010): picked from Google Maps
 * (re-read on the server, never an address from the browser), typed when the
 * search has no match, or left empty to say they have no school on record.
 * The guardian-or-Admin rule is the database's.
 */
export async function saveChildSchoolAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = childSchoolSchema.safeParse({ householdId: formData.get("householdId"), childMemberId: formData.get("childMemberId") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    const { saveSchoolFromForm } = await import("../_lib/places");
    const result = await saveSchoolFromForm(supabase, actor, parsed.data.childMemberId, formData);
    revalidatePath("/school");
    revalidatePath("/places");
    revalidatePath("/family");
    return { notice: result === "removed" ? "Removed." : "Saved." };
  } catch (error) {
    const { PlacesUnavailableError } = await import("@wonderhome/core/places/provider");
    if (error instanceof PlacesUnavailableError) return { error: "That school could not be read just now. Try picking it again in a minute." };
    return { error: toErrorBody(error, "school").body.error.message };
  }
}

// --- A child's teachers and classes outside school (08-010, 08-011) ----------

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const timeField = z
  .string()
  .trim()
  .regex(/^(\d{2}:\d{2})?$/, { error: "Use a time like 17:30." })
  .optional()
  .transform((value) => value || null);
const dateField = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, { error: "Use a date like 2026-11-02." })
  .optional()
  .transform((value) => value || null);
const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

async function inHousehold<T>(householdId: string, work: (supabase: Awaited<ReturnType<typeof createClient>>, actor: Awaited<ReturnType<typeof requireMembership>>) => Promise<T>): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, householdId);
    await work(supabase, actor);
    revalidatePath("/school");
    revalidatePath("/calendar");
    return { notice: "Saved." };
  } catch (error) {
    const { PlacesUnavailableError } = await import("@wonderhome/core/places/provider");
    if (error instanceof PlacesUnavailableError) return { error: "That place could not be read just now. Try picking it again in a minute." };
    return { error: toErrorBody(error, "school").body.error.message };
  }
}

const teacherSchema = z.object({
  householdId: z.uuid(),
  childMemberId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  role: z.enum(["class_teacher", "subject_teacher"]),
  subject: optionalText(80),
  name: z.string().trim().min(1, { error: "What is the teacher's name?" }).max(120),
  contact: optionalText(160),
});

/** A class teacher or a subject teacher, added or changed (08-010). */
export async function saveTeacherAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = teacherSchema.safeParse({
    householdId: field(formData, "householdId"),
    childMemberId: field(formData, "childMemberId"),
    id: field(formData, "id"),
    role: field(formData, "role"),
    subject: field(formData, "subject"),
    name: field(formData, "name"),
    contact: field(formData, "contact"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const { saveTeacher } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, (supabase) => saveTeacher(supabase, { ...parsed.data, id: parsed.data.id || null }));
}

const standDownSchema = z.object({ householdId: z.uuid(), id: z.uuid() });

/** A teacher who no longer teaches the child, stood down (kept, not deleted). */
export async function removeTeacherAction(input: { householdId: string; id: string }): Promise<ActionState> {
  const parsed = standDownSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const { standDownTeacher } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, (supabase) => standDownTeacher(supabase, parsed.data));
}

const activitySchema = z.object({
  householdId: z.uuid(),
  childMemberId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  name: z.string().trim().min(1, { error: "What is the class called?" }).max(120),
  kind: z.string().trim().max(40).optional().transform((value) => value || "other"),
  description: optionalText(300),
  teacherName: optionalText(120),
  teacherContact: optionalText(160),
  days: z.array(z.coerce.number().int().min(1).max(7)).max(7),
  startsAt: timeField,
  endsAt: timeField,
  startsOn: dateField,
  endsOn: dateField,
  notes: optionalText(2000),
});

/**
 * A class outside school, added or changed (08-011): its weekly days and
 * times put its sessions on the Calendar (08-012). Where it is, picked from
 * Google Maps, is re-read on the server; a pick that did not change is left
 * as it is, and a typed place is kept as words.
 */
export async function saveActivityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = activitySchema.safeParse({
    householdId: field(formData, "householdId"),
    childMemberId: field(formData, "childMemberId"),
    id: field(formData, "id"),
    name: field(formData, "name"),
    kind: field(formData, "kind"),
    description: field(formData, "description"),
    teacherName: field(formData, "teacherName"),
    teacherContact: field(formData, "teacherContact"),
    days: formData.getAll("days").map(String),
    startsAt: field(formData, "startsAt"),
    endsAt: field(formData, "endsAt"),
    startsOn: field(formData, "startsOn"),
    endsOn: field(formData, "endsOn"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if (parsed.data.startsAt && parsed.data.endsAt && parsed.data.startsAt >= parsed.data.endsAt) return { error: "The class has to end after it starts." };
  if (parsed.data.startsOn && parsed.data.endsOn && parsed.data.startsOn > parsed.data.endsOn) return { error: "The class has to end after it starts." };
  const placeId = (field(formData, "place_id") ?? "").trim();
  const typedPlace = (field(formData, "place_name") ?? "").trim();
  const currentPlaceId = (field(formData, "place_current") ?? "").trim();
  const { saveActivity } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, async (supabase, actor) => {
    let place: Parameters<typeof saveActivity>[1]["place"];
    if (placeId && placeId === currentPlaceId) place = undefined;
    else if (placeId) {
      const { pickedPlace } = await import("../_lib/places");
      const { PlacesUnavailableError } = await import("@wonderhome/core/places/provider");
      const picked = await pickedPlace(actor, placeId, formData.get("place_session"));
      if (!picked) throw new PlacesUnavailableError("unavailable");
      place = { picked };
    } else place = typedPlace ? { typed: typedPlace } : null;
    await saveActivity(supabase, { ...parsed.data, id: parsed.data.id || null, place });
  });
}

/** A class the child no longer goes to, stood down with its notes kept; it leaves the Calendar. */
export async function removeActivityAction(input: { householdId: string; id: string }): Promise<ActionState> {
  const parsed = standDownSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const { standDownActivity } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, (supabase) => standDownActivity(supabase, parsed.data));
}

const noteSchema = z.object({
  householdId: z.uuid(),
  activityId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  kind: z.enum(["competition", "award", "note"]),
  title: z.string().trim().min(1, { error: "What is it?" }).max(200),
  onDate: dateField,
  detail: optionalText(1000),
  result: optionalText(120),
});

/** A competition coming up, a medal or award won, or a note, on one class. */
export async function saveActivityNoteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = noteSchema.safeParse({
    householdId: field(formData, "householdId"),
    activityId: field(formData, "activityId"),
    id: field(formData, "id"),
    kind: field(formData, "kind"),
    title: field(formData, "title"),
    onDate: field(formData, "onDate"),
    detail: field(formData, "detail"),
    result: field(formData, "result"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const { saveActivityNote } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, (supabase) => saveActivityNote(supabase, { ...parsed.data, id: parsed.data.id || null }));
}

export async function removeActivityNoteAction(input: { householdId: string; id: string }): Promise<ActionState> {
  const parsed = standDownSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const { standDownActivityNote } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, (supabase) => standDownActivityNote(supabase, parsed.data));
}
