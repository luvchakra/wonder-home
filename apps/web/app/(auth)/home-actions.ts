"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { ASSET_CATEGORIES } from "@wonderhome/core/home/assets";
import {
  createAsset,
  createPet,
  createServiceRequest,
  recordAssetService,
  setAssetStatus,
  setPetActive,
  updateAsset,
  updatePet,
  updateServiceRequest,
} from "@wonderhome/core/home/repository";
import { SERVICE_STATUSES } from "@wonderhome/core/home/services";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { GENDER_MAX_LENGTH } from "@wonderhome/core/identity/member-details";

import { deletePhoto, petPhotoPath, postedPhoto, storePhoto } from "../_lib/photos";
import type { ActionState } from "./actions";

/**
 * Adding to Home & upkeep by hand — the other half of "add something": the
 * AI chat link was the only way in, even though `createAsset` and
 * `createServiceRequest` already existed for the API to call on the AI's
 * behalf. This is the same writes, reached directly.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." });

const assetSchema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "Give it a name." }).max(120),
  category: z.enum(ASSET_CATEGORIES).optional(),
  location: z.string().trim().max(80).optional(),
  serviceIntervalDays: z.union([z.coerce.number().int().min(1).max(3650), z.literal("")]).optional(),
  lastServicedOn: z.union([isoDate, z.literal("")]).optional(),
  warrantyExpiresOn: z.union([isoDate, z.literal("")]).optional(),
  amcExpiresOn: z.union([isoDate, z.literal("")]).optional(),
});

/** The asset form's fields, read the same way for adding and for changing one. */
function readAssetForm(formData: FormData) {
  return assetSchema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    location: formData.get("location") || undefined,
    serviceIntervalDays: formData.get("serviceIntervalDays") || undefined,
    lastServicedOn: formData.get("lastServicedOn") || undefined,
    warrantyExpiresOn: formData.get("warrantyExpiresOn") || undefined,
    amcExpiresOn: formData.get("amcExpiresOn") || undefined,
  });
}

export async function createAssetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = readAssetForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    await createAsset(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      category: parsed.data.category,
      location: parsed.data.location || null,
      serviceIntervalDays: parsed.data.serviceIntervalDays === "" ? null : parsed.data.serviceIntervalDays,
      lastServicedOn: parsed.data.lastServicedOn || null,
      warrantyExpiresOn: parsed.data.warrantyExpiresOn || null,
      amcExpiresOn: parsed.data.amcExpiresOn || null,
    });

    revalidatePath("/household/home");
    return { notice: "Added. WonderHome will watch its service schedule from here." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

const serviceRequestSchema = z.object({
  householdId: z.uuid(),
  subject: z.string().trim().min(1, { error: "What does it need?" }).max(160),
  providerName: z.string().trim().max(120).optional(),
  providerContact: z.string().trim().max(120).optional(),
});

export async function createServiceRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = serviceRequestSchema.safeParse({
    householdId: formData.get("householdId"),
    subject: formData.get("subject"),
    providerName: formData.get("providerName") || undefined,
    providerContact: formData.get("providerContact") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    await createServiceRequest(supabase, {
      householdId: parsed.data.householdId,
      subject: parsed.data.subject,
      providerName: parsed.data.providerName || null,
      providerContact: parsed.data.providerContact || null,
      nextAction: "Find and book someone",
      nextActionBy: "household",
    });

    revalidatePath("/household/home");
    return { notice: "Raised. It’ll show under Service requests until it’s booked." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/** Changing what was said about a thing in the house: every field the add form has (rule 12). */
export async function updateAssetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const assetId = z.uuid().safeParse(formData.get("assetId"));
  const parsed = readAssetForm(formData);
  if (!assetId.success || !parsed.success) {
    return { error: parsed.success ? "Please try again." : (parsed.error.issues[0]?.message ?? "Please check the details above.") };
  }
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await updateAsset(supabase, parsed.data.householdId, assetId.data, {
      name: parsed.data.name,
      category: parsed.data.category,
      location: parsed.data.location || null,
      serviceIntervalDays: parsed.data.serviceIntervalDays === "" || parsed.data.serviceIntervalDays === undefined ? null : parsed.data.serviceIntervalDays,
      lastServicedOn: parsed.data.lastServicedOn || null,
      warrantyExpiresOn: parsed.data.warrantyExpiresOn || null,
      amcExpiresOn: parsed.data.amcExpiresOn || null,
    });
    revalidatePath("/household/home");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/** Retiring a thing (sold, replaced, gone) or bringing it back — never a delete. */
export async function setAssetStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ householdId: z.uuid(), assetId: z.uuid(), status: z.enum(["active", "retired"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await setAssetStatus(supabase, parsed.data.householdId, parsed.data.assetId, parsed.data.status);
    revalidatePath("/household/home");
    return { notice: parsed.data.status === "retired" ? "Retired. Its history stays on record." : "Back in use." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/** "Serviced": a visit on a day (today unless another is picked), counted into the next service date. */
export async function markAssetServicedAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ householdId: z.uuid(), assetId: z.uuid(), occurredOn: isoDate, kind: z.enum(["service", "repair", "inspection", "replacement"]).optional() })
    .safeParse({ ...Object.fromEntries(formData), kind: formData.get("kind") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await recordAssetService(supabase, { householdId: parsed.data.householdId, assetId: parsed.data.assetId, occurredOn: parsed.data.occurredOn, kind: parsed.data.kind });
    revalidatePath("/household/home");
    return { notice: "Recorded. The next service counts from that day." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/** Moving a service request on, or correcting it; cancelling is how one is taken back. */
export async function updateServiceRequestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      householdId: z.uuid(),
      requestId: z.uuid(),
      status: z.enum(SERVICE_STATUSES).optional(),
      subject: z.string().trim().min(1, { error: "What does it need?" }).max(160).optional(),
      providerName: z.string().trim().max(120).optional(),
      providerContact: z.string().trim().max(120).optional(),
      scheduledOn: z.union([isoDate, z.literal("")]).optional(),
      nextAction: z.string().trim().max(200).optional(),
    })
    .safeParse({
      householdId: formData.get("householdId"),
      requestId: formData.get("requestId"),
      status: formData.get("status") || undefined,
      subject: formData.has("subject") ? formData.get("subject") : undefined,
      providerName: formData.has("providerName") ? formData.get("providerName") : undefined,
      providerContact: formData.has("providerContact") ? formData.get("providerContact") : undefined,
      scheduledOn: formData.has("scheduledOn") ? formData.get("scheduledOn") : undefined,
      nextAction: formData.has("nextAction") ? formData.get("nextAction") : undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const { scheduledOn } = parsed.data;
    await updateServiceRequest(supabase, parsed.data.householdId, parsed.data.requestId, {
      status: parsed.data.status,
      subject: parsed.data.subject,
      providerName: parsed.data.providerName === undefined ? undefined : parsed.data.providerName || null,
      providerContact: parsed.data.providerContact === undefined ? undefined : parsed.data.providerContact || null,
      // A day picked for the visit; noon UTC keeps it on that day on any clock.
      scheduledFor: scheduledOn === undefined ? undefined : scheduledOn ? new Date(`${scheduledOn}T12:00:00Z`) : null,
      nextAction: parsed.data.nextAction === undefined ? undefined : parsed.data.nextAction || null,
    });
    revalidatePath("/household/home");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/**
 * Pets, treated as family (product feedback: "under family tab, under
 * invite, add option to add a pet, let should be treated as family, all
 * attributes applicable for pets should be shown"). Admin-gated to match
 * every other addition to the household member roster — pets aren't
 * `household_members` rows, but the household's roster still gets one
 * person deciding who's on it.
 */
const petSchema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "Give them a name." }).max(60),
  species: z.string().trim().min(1, { error: "What kind of pet?" }).max(40),
  dateOfBirth: z.union([isoDate, z.literal("")]).optional(),
  gender: z.string().trim().max(GENDER_MAX_LENGTH, { error: "Keep gender under 40 characters." }).optional(),
  vetName: z.string().trim().max(120).optional(),
  vetContact: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createPetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = petSchema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    species: formData.get("species"),
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    gender: formData.get("gender") || undefined,
    vetName: formData.get("vetName") || undefined,
    vetContact: formData.get("vetContact") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    await createPet(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      species: parsed.data.species,
      dateOfBirth: parsed.data.dateOfBirth || null,
      gender: parsed.data.gender || null,
      vetName: parsed.data.vetName || null,
      vetContact: parsed.data.vetContact || null,
      notes: parsed.data.notes || null,
    });

    revalidatePath("/family");
    revalidatePath("/household/home");
    revalidatePath("/household/members");
    return { notice: "Added to the family." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

const updatePetSchema = petSchema.extend({ petId: z.uuid() });

export async function updatePetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updatePetSchema.safeParse({
    householdId: formData.get("householdId"),
    petId: formData.get("petId"),
    name: formData.get("name"),
    species: formData.get("species"),
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    gender: formData.get("gender") || undefined,
    vetName: formData.get("vetName") || undefined,
    vetContact: formData.get("vetContact") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    await updatePet(supabase, parsed.data.householdId, parsed.data.petId, {
      name: parsed.data.name,
      species: parsed.data.species,
      dateOfBirth: parsed.data.dateOfBirth || null,
      gender: parsed.data.gender || null,
      vetName: parsed.data.vetName || null,
      vetContact: parsed.data.vetContact || null,
      notes: parsed.data.notes || null,
    });

    revalidatePath("/family");
    revalidatePath("/household/home");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

const petIdSchema = z.object({ householdId: z.uuid(), petId: z.uuid() });

/** The other half of adding a pet (rule 12): standing them down, not deleting their history. */
export async function retirePetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = petIdSchema.safeParse({ householdId: formData.get("householdId"), petId: formData.get("petId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await setPetActive(supabase, parsed.data.householdId, parsed.data.petId, false);

    revalidatePath("/family");
    revalidatePath("/household/home");
    return { notice: "Retired." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

export async function reactivatePetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = petIdSchema.safeParse({ householdId: formData.get("householdId"), petId: formData.get("petId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await setPetActive(supabase, parsed.data.householdId, parsed.data.petId, true);

    revalidatePath("/family");
    revalidatePath("/household/home");
    return { notice: "Back on the roster." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/**
 * A pet's photo, added or changed from Family — the same private `avatars`
 * bucket and path onboarding uses, checked by its bytes before it is kept.
 */
export async function updatePetPhotoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = petIdSchema.safeParse({ householdId: formData.get("householdId"), petId: formData.get("petId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const photo = await postedPhoto(formData, "photo");
    if (!photo) return { error: "Choose a photo first." };
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const path = petPhotoPath(parsed.data.householdId, parsed.data.petId);
    await storePhoto(supabase, path, photo);
    await updatePet(supabase, parsed.data.householdId, parsed.data.petId, { photoPath: path });

    revalidatePath("/family");
    revalidatePath("/household/home");
    return { notice: "Photo updated." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/** The other half of adding a pet's photo (rule 12): taking it away again. */
export async function removePetPhotoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = petIdSchema.safeParse({ householdId: formData.get("householdId"), petId: formData.get("petId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await deletePhoto(supabase, petPhotoPath(parsed.data.householdId, parsed.data.petId));
    await updatePet(supabase, parsed.data.householdId, parsed.data.petId, { photoPath: null });

    revalidatePath("/family");
    revalidatePath("/household/home");
    return { notice: "Photo removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

const petPreferenceSchema = z.object({
  householdId: z.uuid(),
  petId: z.uuid(),
  id: z.uuid().optional().or(z.literal("")),
  kind: z.string().trim().min(1).max(40),
  subject: z.string().trim().min(1).max(120),
  note: z.string().max(300).optional(),
});

/** A pet's like, dislike, favourite, fear or allergy, added or changed (the owner, 2026-10-20). An Admin's, like the pet itself. */
export async function savePetPreferenceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = petPreferenceSchema.safeParse({
    householdId: formData.get("householdId"),
    petId: formData.get("petId"),
    id: formData.get("id") ?? undefined,
    kind: formData.get("kind"),
    subject: formData.get("subject"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "Say what kind it is and what it is." };
  try {
    const supabase = await createClient();
    const actor = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const { savePetPreference } = await import("@wonderhome/core/home/pet-preferences");
    await savePetPreference(supabase, { ...parsed.data, id: parsed.data.id || null, createdBy: actor.memberId });
    revalidatePath("/family");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}

/** One of a pet's likes taken away. */
export async function removePetPreferenceAction(input: { householdId: string; id: string }): Promise<ActionState> {
  const parsed = z.object({ householdId: z.uuid(), id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const { removePetPreference } = await import("@wonderhome/core/home/pet-preferences");
    await removePetPreference(supabase, parsed.data);
    revalidatePath("/family");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "home").body.error.message };
  }
}
