"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError, toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { connectIntegration, disconnectIntegration } from "@wonderhome/core/integrations/repository";
import { addSchoolChannel, setSchoolChannelActive } from "@wonderhome/core/school/channel-repository";
import { parseSchoolChannel } from "@wonderhome/core/school/channels";
import { schoolPortalCredentialStatus, setSchoolPortalCredentials, updateSchoolPortalCredentials } from "@wonderhome/core/school/portal-credentials";
import { addPortalScrapeUrl, removePortalScrapeUrl, setPortalScrapeUrlEnabled, type PortalScrapeKind } from "@wonderhome/core/portals/scrape-url-repository";
import { latestPortalFetchJob, type PortalFetchJobStatus } from "@wonderhome/core/portals/job-repository";
import { getSchoolProvider } from "@wonderhome/core/school/providers";
import { addSchoolItem } from "@wonderhome/core/calendar/add-event";
import { cancelSchoolItem, updateSchoolItem } from "@wonderhome/core/school/repository";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { schoolWhen } from "@wonderhome/core/school/times";

import { duplicateFor, duplicateLine } from "../_lib/event-window";
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

/** A duplicate names what is already on the calendar; sending again with `confirmDuplicate` adds it anyway. */
export type SchoolItemActionState = ActionState & { duplicate?: string | null };

export async function createSchoolItemAction(_previous: SchoolItemActionState, formData: FormData): Promise<SchoolItemActionState> {
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
    const when = schoolWhen({ date: parsed.data.dueAt, time: parsed.data.dueTime, endTime: parsed.data.endTime, timezone: membership.household.timezone });

    // Already on the calendar under this or another name — a family event,
    // another school entry — is asked about once before a second copy is made.
    if (when.dueAt && formData.get("confirmDuplicate") !== "on") {
      const duplicate = await duplicateFor(supabase, membership, {
        title: parsed.data.title,
        start: new Date(when.dueAt),
        day: when.dueTimeKnown ? undefined : parsed.data.dueAt,
      });
      if (duplicate) return { duplicate };
    }

    // Through HomeEvents' one door: it refuses a copy the check above could not see.
    const added = await addSchoolItem(
      supabase,
      {
        householdId: parsed.data.householdId,
        childMemberId: parsed.data.childMemberId,
        kind: parsed.data.kind,
        title: parsed.data.title,
        subject: parsed.data.subject || null,
        detail: parsed.data.detail || null,
        ...when,
        estimatedMinutes: parsed.data.estimatedMinutes === "" ? null : parsed.data.estimatedMinutes,
      },
      { timeZone: membership.household.timezone, confirmed: formData.get("confirmDuplicate") === "on" },
    );
    if (added.kind === "duplicate") return { duplicate: await duplicateLine(membership, added.existing) };

    revalidatePath("/school");
    revalidatePath("/calendar");
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
    // The school day, read before anything is written so a half-given time refuses the whole save.
    const { readHoursInput, HOURS_PROBLEM } = await import("@wonderhome/core/household/day-hours");
    const hours = formData.get("schoolHoursField") === "1" ? readHoursInput(formData.get("schoolStarts"), formData.get("schoolEnds"), { overnight: false }) : null;
    if (hours && !hours.ok) return { error: HOURS_PROBLEM[hours.problem] };
    const result = await saveSchoolFromForm(supabase, actor, parsed.data.childMemberId, formData);
    // The same hours the child's details in Family set (one record), on the school now on record.
    if (hours?.ok && result !== "removed") {
      const { setSchoolHours } = await import("@wonderhome/core/school/enrolments");
      await setSchoolHours(supabase, { householdId: parsed.data.householdId, childMemberId: parsed.data.childMemberId, hours: hours.hours });
    }
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
  kind: z.enum(["competition", "exam", "event", "award", "note"]),
  title: z.string().trim().min(1, { error: "What is it?" }).max(200),
  onDate: dateField,
  startsAt: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
  endsAt: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
  detail: optionalText(1000),
  result: optionalText(120),
});

/** A competition, exam or event coming up, a medal or award won, or a note, on one class. */
export async function saveActivityNoteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = noteSchema.safeParse({
    householdId: field(formData, "householdId"),
    activityId: field(formData, "activityId"),
    id: field(formData, "id"),
    kind: field(formData, "kind"),
    title: field(formData, "title"),
    onDate: field(formData, "onDate"),
    startsAt: field(formData, "startsAt"),
    endsAt: field(formData, "endsAt"),
    detail: field(formData, "detail"),
    result: field(formData, "result"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const { saveActivityNote } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, (supabase) =>
    saveActivityNote(supabase, { ...parsed.data, id: parsed.data.id || null, startsAt: parsed.data.startsAt || null, endsAt: parsed.data.endsAt || null }),
  );
}

export async function removeActivityNoteAction(input: { householdId: string; id: string }): Promise<ActionState> {
  const parsed = standDownSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const { standDownActivityNote } = await import("@wonderhome/core/school/activities");
  return inHousehold(parsed.data.householdId, (supabase) => standDownActivityNote(supabase, parsed.data));
}

// --- A child's timetable and exams (08-015) ---------------------------------------

const periodSchema = z.object({
  householdId: z.uuid(),
  childMemberId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  weekday: z.coerce.number().int().min(1, { error: "Which day is it?" }).max(7),
  startsAt: z.string().trim().regex(/^\d{2}:\d{2}$/, { error: "When does it start?" }),
  endsAt: z.string().trim().regex(/^\d{2}:\d{2}$/, { error: "When does it end?" }),
  subject: z.string().trim().min(1, { error: "Which subject is it?" }).max(80),
  teacherName: optionalText(120),
  room: optionalText(60),
});

/** One period of a child's school week, added or changed. */
export async function savePeriodAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = periodSchema.safeParse({
    householdId: field(formData, "householdId"),
    childMemberId: field(formData, "childMemberId"),
    id: field(formData, "id"),
    weekday: field(formData, "weekday"),
    startsAt: field(formData, "startsAt"),
    endsAt: field(formData, "endsAt"),
    subject: field(formData, "subject"),
    teacherName: field(formData, "teacherName"),
    room: field(formData, "room"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if (parsed.data.startsAt >= parsed.data.endsAt) return { error: "A period has to end after it starts." };
  const { savePeriod } = await import("@wonderhome/core/school/exams");
  return inHousehold(parsed.data.householdId, (supabase) => savePeriod(supabase, { ...parsed.data, id: parsed.data.id || null }));
}

const examSchema = z.object({
  householdId: z.uuid(),
  childMemberId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  examType: z.string().trim().min(1, { error: "Which kind of exam is it?" }).max(60),
  title: optionalText(120),
  notes: optionalText(2000),
});

/**
 * An exam for a child, added or changed. A kind of exam the household typed
 * in for the first time becomes one of its own types (rule 20), so it is
 * there to pick next time.
 */
export async function saveExamAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = examSchema.safeParse({
    householdId: field(formData, "householdId"),
    childMemberId: field(formData, "childMemberId"),
    id: field(formData, "id"),
    examType: field(formData, "examType"),
    title: field(formData, "title"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const { addExamType, saveExam } = await import("@wonderhome/core/school/exams");
  return inHousehold(parsed.data.householdId, async (supabase) => {
    const { name } = await addExamType(supabase, { householdId: parsed.data.householdId, name: parsed.data.examType });
    await saveExam(supabase, { ...parsed.data, examType: name, id: parsed.data.id || null });
  });
}

const paperSchema = z.object({
  householdId: z.uuid(),
  examId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  subject: z.string().trim().min(1, { error: "Which subject is it?" }).max(80),
  onDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "On which day is it?" }),
  startsAt: timeField,
  endsAt: timeField,
  syllabus: optionalText(4000),
  links: z.string().max(6000).optional(),
});

/** One subject of an exam, on its day, with what it covers and links to material. */
export async function savePaperAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = paperSchema.safeParse({
    householdId: field(formData, "householdId"),
    examId: field(formData, "examId"),
    id: field(formData, "id"),
    subject: field(formData, "subject"),
    onDate: field(formData, "onDate"),
    startsAt: field(formData, "startsAt"),
    endsAt: field(formData, "endsAt"),
    syllabus: field(formData, "syllabus"),
    links: field(formData, "links"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if (parsed.data.startsAt && parsed.data.endsAt && parsed.data.startsAt >= parsed.data.endsAt) return { error: "It has to end after it starts." };
  const { cleanLinks, MAX_EXAM_LINKS, savePaper } = await import("@wonderhome/core/school/exams");
  const typed = (parsed.data.links ?? "").split(/\s*\n\s*/).filter(Boolean);
  const { refused } = cleanLinks(typed);
  if (refused.length > 0) return { error: `"${refused[0]}" is not a web address.` };
  if (typed.length > MAX_EXAM_LINKS) return { error: `At most ${MAX_EXAM_LINKS} links.` };
  return inHousehold(parsed.data.householdId, (supabase) => savePaper(supabase, { ...parsed.data, links: typed, id: parsed.data.id || null }));
}

const schoolRecordSchema = z.object({ householdId: z.uuid(), id: z.uuid(), kind: z.enum(["period", "exam", "paper"]) });

/** A period, an exam or one of its subjects, stood down (kept, not deleted). */
export async function removeSchoolRecordAction(input: { householdId: string; id: string; kind: "period" | "exam" | "paper" }): Promise<ActionState> {
  const parsed = schoolRecordSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const { standDownSchoolRecord } = await import("@wonderhome/core/school/exams");
  return inHousehold(parsed.data.householdId, (supabase) => standDownSchoolRecord(supabase, parsed.data));
}

// ---------------------------------------------------------------------------
// Connecting a school and tracking its channels (stories 08-029, 08-031).
// ---------------------------------------------------------------------------
// Every one of these is an administrator's action — connecting a school sets up
// a shared credential and a feed into the household's HomeSend. The forward
// path (`manual`) is not here: it needs no connection, so there is nothing to
// save; the screen simply points a household at it.

/** An Admin's action that touches a school connection, with the integrations screen revalidated. */
async function asSchoolAdmin<T>(
  householdId: string,
  work: (supabase: Awaited<ReturnType<typeof createClient>>, actor: Awaited<ReturnType<typeof requireHouseholdAdmin>>) => Promise<T>,
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const actor = await requireHouseholdAdmin(supabase, householdId);
    await work(supabase, actor);
    revalidatePath("/settings/connections");
    return { notice: "Saved." };
  } catch (error) {
    return { error: toErrorBody(error, "school").body.error.message };
  }
}

const connectSchema = z.object({ householdId: z.uuid(), provider: z.string().trim().min(1).max(64) });

/** Register a school portal for the household. It stays "connecting" until an adapter and consent make it live. */
export async function connectSchoolPortalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = connectSchema.safeParse({ householdId: field(formData, "householdId"), provider: field(formData, "provider") });
  if (!parsed.success) return { error: "Please try again." };
  const descriptor = getSchoolProvider(parsed.data.provider);
  if (!descriptor || descriptor.auth === "manual") return { error: "That is not a school portal you can connect." };
  return asSchoolAdmin(parsed.data.householdId, (supabase, actor) =>
    connectIntegration(supabase, {
      householdId: parsed.data.householdId,
      kind: "school",
      provider: descriptor.id,
      scopes: descriptor.scopes,
      actorMemberId: actor.memberId,
    }),
  );
}

/** Disconnect a school portal (its tracked channels go with it, by the connection's cascade). */
export async function disconnectSchoolPortalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = connectSchema.safeParse({ householdId: field(formData, "householdId"), provider: field(formData, "provider") });
  if (!parsed.success) return { error: "Please try again." };
  return asSchoolAdmin(parsed.data.householdId, (supabase, actor) =>
    disconnectIntegration(supabase, { householdId: parsed.data.householdId, kind: "school", provider: parsed.data.provider, actorMemberId: actor.memberId }),
  );
}

const trackChannelSchema = z.object({
  householdId: z.uuid(),
  integrationId: z.uuid(),
  provider: z.string().trim().min(1).max(64),
  url: z.string().trim().min(1).max(2048),
  childMemberId: z.union([z.uuid(), z.literal("")]).optional(),
});

/** Track a message channel from a pasted portal link. The link is recognised and normalised before it is stored. */
export async function trackSchoolChannelAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = trackChannelSchema.safeParse({
    householdId: field(formData, "householdId"),
    integrationId: field(formData, "integrationId"),
    provider: field(formData, "provider"),
    url: field(formData, "url"),
    childMemberId: field(formData, "childMemberId"),
  });
  if (!parsed.success) return { error: "Please try again." };

  const recognised = parseSchoolChannel(parsed.data.url);
  if (!recognised.ok) {
    return {
      error:
        recognised.reason === "invalid_url"
          ? "That is not a web address."
          : recognised.reason === "unknown_provider"
            ? "That link is not from a school we recognise."
            : "That link is not a channel.",
    };
  }
  if (recognised.channel.provider !== parsed.data.provider) {
    return { error: "That link is for a different school than this connection." };
  }

  return asSchoolAdmin(parsed.data.householdId, (supabase, actor) =>
    addSchoolChannel(supabase, {
      householdId: parsed.data.householdId,
      integrationId: parsed.data.integrationId,
      provider: recognised.channel.provider,
      channelId: recognised.channel.channelId,
      url: recognised.channel.url,
      childMemberId: parsed.data.childMemberId || null,
      createdBy: actor.memberId,
    }),
  );
}

const stopChannelSchema = z.object({ householdId: z.uuid(), id: z.uuid(), active: z.enum(["true", "false"]) });

/** Stop or resume tracking a channel. Stopping keeps the row and its cursor. */
export async function setSchoolChannelActiveAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = stopChannelSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id"), active: field(formData, "active") });
  if (!parsed.success) return { error: "Please try again." };
  return asSchoolAdmin(parsed.data.householdId, (supabase) =>
    setSchoolChannelActive(supabase, { householdId: parsed.data.householdId, id: parsed.data.id, active: parsed.data.active === "true" }),
  );
}

const portalCredentialsSchema = z.object({
  householdId: z.uuid(),
  provider: z.string().trim().min(1).max(64),
  url: z.string().trim().url({ error: "Enter the portal's web address." }).max(2048),
  username: z.string().trim().min(1, { error: "Enter the username." }).max(320),
  password: z.string().min(1, { error: "Enter the password." }).max(1024),
});

/**
 * Sign a school portal in and keep it connected (story 08-032).
 *
 * An Admin's act. The sign-in is stored where nothing reachable from a browser
 * can read it back (`school_portal_credentials`); the connection then stays
 * until a person disconnects it. No portal is live yet, so this stores the
 * sign-in and connects the account; the working fetch follows once the portal's
 * own requests are known.
 */
export async function connectSchoolPortalWithCredentialsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = portalCredentialsSchema.safeParse({
    householdId: field(formData, "householdId"),
    provider: field(formData, "provider"),
    url: field(formData, "url"),
    username: field(formData, "username"),
    password: field(formData, "password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  const descriptor = getSchoolProvider(parsed.data.provider);
  if (!descriptor || descriptor.auth !== "credentials") return { error: "That is not a school portal you can sign in to." };

  return asSchoolAdmin(parsed.data.householdId, async (supabase, actor) => {
    const { id } = await connectIntegration(supabase, {
      householdId: parsed.data.householdId,
      kind: "school",
      provider: descriptor.id,
      scopes: descriptor.scopes,
      actorMemberId: actor.memberId,
    });
    await setSchoolPortalCredentials(supabase, {
      householdId: parsed.data.householdId,
      integrationId: id,
      portalUrl: parsed.data.url,
      username: parsed.data.username,
      password: parsed.data.password,
      setByMemberId: actor.memberId,
    });
  });
}

const fetchNowSchema = z.object({ householdId: z.uuid(), integrationId: z.uuid() });

/**
 * Fetch a connected portal on demand (story 08-033): enqueue a job for the Fly
 * worker, which signs in, reads the tracked pages and files what it finds
 * through HomeSend for confirmation. An Admin's act (the RPC enforces it);
 * deduped to the open job.
 */
export async function fetchSchoolPortalNowAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fetchNowSchema.safeParse({ householdId: field(formData, "householdId"), integrationId: field(formData, "integrationId") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const { error } = await supabase.rpc("enqueue_portal_fetch_job", { p_integration_id: parsed.data.integrationId });
    if (error) return { error: "Couldn’t start a fetch just now. Please try again." };
    revalidatePath("/settings/connections");
    return { notice: "Fetch started. Anything new will appear in HomeSend for you to confirm." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "school").body.error.message };
  }
}

const PORTAL_SCRAPE_KINDS = ["homework", "calendar", "messages", "results", "generic"] as const;
const scrapeUrlSchema = z.object({
  householdId: z.uuid(),
  integrationId: z.uuid(),
  url: z.string().trim().min(1, { error: "Enter the page's web address." }).max(2048),
  kind: z.enum(PORTAL_SCRAPE_KINDS).optional(),
  childMemberId: z.union([z.uuid(), z.literal("")]).optional(),
});

/**
 * Track a post-auth page of a connected portal for the worker to read (08-033).
 * The portal's own web address is read on the server (never trusted from the
 * form) so the page is validated same-site against it.
 */
export async function addPortalScrapeUrlAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scrapeUrlSchema.safeParse({
    householdId: field(formData, "householdId"),
    integrationId: field(formData, "integrationId"),
    url: field(formData, "url"),
    kind: field(formData, "kind"),
    childMemberId: field(formData, "childMemberId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  return asSchoolAdmin(parsed.data.householdId, async (supabase, actor) => {
    const status = await schoolPortalCredentialStatus(supabase, parsed.data.householdId);
    const portalUrl = status.find((row) => row.integrationId === parsed.data.integrationId)?.portalUrl;
    if (!portalUrl) throw ApiError.badRequest("Connect the portal first.");
    await addPortalScrapeUrl(supabase, {
      householdId: parsed.data.householdId,
      integrationId: parsed.data.integrationId,
      portalUrl,
      url: parsed.data.url,
      kind: (parsed.data.kind ?? "generic") as PortalScrapeKind,
      childMemberId: parsed.data.childMemberId || null,
      createdBy: actor.memberId,
    });
  });
}

const scrapeUrlIdSchema = z.object({ householdId: z.uuid(), id: z.uuid() });

export async function removePortalScrapeUrlAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scrapeUrlIdSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id") });
  if (!parsed.success) return { error: "Please try again." };
  return asSchoolAdmin(parsed.data.householdId, (supabase) => removePortalScrapeUrl(supabase, { householdId: parsed.data.householdId, id: parsed.data.id }));
}

const scrapeUrlEnabledSchema = z.object({ householdId: z.uuid(), id: z.uuid(), enabled: z.enum(["true", "false"]) });

export async function setPortalScrapeUrlEnabledAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scrapeUrlEnabledSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id"), enabled: field(formData, "enabled") });
  if (!parsed.success) return { error: "Please try again." };
  return asSchoolAdmin(parsed.data.householdId, (supabase) =>
    setPortalScrapeUrlEnabled(supabase, { householdId: parsed.data.householdId, id: parsed.data.id, enabled: parsed.data.enabled === "true" }),
  );
}

const updateCredentialsSchema = z.object({
  householdId: z.uuid(),
  integrationId: z.uuid(),
  provider: z.string().trim().min(1).max(64),
  url: z.string().trim().url({ error: "Enter the portal's web address." }).max(2048),
  username: z.string().trim().min(1, { error: "Enter the username." }).max(320),
  // Blank keeps the stored password — the field never shows the current one.
  password: z.union([z.string().max(1024), z.literal("")]).optional(),
});

/**
 * Change a connected portal's sign-in — its web address, username, and the
 * password only when a new one is typed (story 08-032). An Admin's act; the
 * stored password is never read back to the browser, so "leave blank to keep"
 * means the field simply is not written, never compared.
 */
export async function updateSchoolPortalCredentialsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateCredentialsSchema.safeParse({
    householdId: field(formData, "householdId"),
    integrationId: field(formData, "integrationId"),
    provider: field(formData, "provider"),
    url: field(formData, "url"),
    username: field(formData, "username"),
    password: field(formData, "password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  const descriptor = getSchoolProvider(parsed.data.provider);
  if (!descriptor || descriptor.auth !== "credentials") return { error: "That is not a school portal you can sign in to." };

  return asSchoolAdmin(parsed.data.householdId, (supabase, actor) =>
    updateSchoolPortalCredentials(supabase, {
      householdId: parsed.data.householdId,
      integrationId: parsed.data.integrationId,
      portalUrl: parsed.data.url,
      username: parsed.data.username,
      password: parsed.data.password || null,
      actorMemberId: actor.memberId,
    }),
  );
}

/**
 * Test a connected portal's sign-in on demand (story 08-033): enqueue a fetch so
 * the worker signs in; the connection state (connected / reconnect needed) then
 * updates on the card. Same governed path as "Fetch now".
 */
export async function testSchoolPortalConnectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fetchNowSchema.safeParse({ householdId: field(formData, "householdId"), integrationId: field(formData, "integrationId") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const { error } = await supabase.rpc("enqueue_portal_fetch_job", { p_integration_id: parsed.data.integrationId });
    if (error) return { error: "Couldn’t start a check just now. Please try again." };
    revalidatePath("/settings/connections");
    return { notice: "Checking the sign-in… the connection state updates here once the worker signs in." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "school").body.error.message };
  }
}

/**
 * The outcome of the most recent fetch for a connection (story 08-033), so the
 * Connect-school screen can poll after "Test" / "Fetch now" and tell the Admin
 * whether the worker signed in or hit an error — instead of a message that never
 * resolves. Reads the household's own job row (member-readable); never the
 * session or any portal content.
 */
export async function portalConnectionStatusAction(input: {
  householdId: string;
  integrationId: string;
}): Promise<{ status: PortalFetchJobStatus | "none"; reason: string | null }> {
  const parsed = fetchNowSchema.safeParse(input);
  if (!parsed.success) return { status: "none", reason: null };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const job = await latestPortalFetchJob(supabase, parsed.data.householdId, parsed.data.integrationId);
    return { status: job?.status ?? "none", reason: job?.reason ?? null };
  } catch {
    return { status: "none", reason: null };
  }
}
