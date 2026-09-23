"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import {
  arrangeCover,
  createBackupService,
  setBackupServiceActive,
  updateBackupService,
} from "@wonderhome/core/household/backup-services";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * Backup services (story 07-008): the outside people a household can call
 * when a helper is away, and arranging one of them for a day. Admin only,
 * checked here and again by RLS.
 */
const outcomeKey = z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/);

const serviceSchema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "Give the service a name." }).max(120),
  contact: z.string().trim().max(120).optional(),
  covers: z.array(outcomeKey).max(40),
  notes: z.string().trim().max(300).optional(),
});

function readService(formData: FormData) {
  return {
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    contact: formData.get("contact") || undefined,
    covers: formData.getAll("covers"),
    notes: formData.get("notes") || undefined,
  };
}

function refresh() {
  revalidatePath("/househelper");
  revalidatePath("/household/home");
}

export async function createBackupServiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = serviceSchema.safeParse(readService(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await createBackupService(supabase, {
      householdId: parsed.data.householdId,
      createdByMemberId: membership.memberId,
      name: parsed.data.name,
      contact: parsed.data.contact ?? null,
      covers: parsed.data.covers,
      notes: parsed.data.notes ?? null,
    });
    refresh();
    return { notice: "Added." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "backup-services").body.error.message };
  }
}

export async function updateBackupServiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = serviceSchema.extend({ id: z.uuid() }).safeParse({ ...readService(formData), id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await updateBackupService(supabase, {
      householdId: parsed.data.householdId,
      id: parsed.data.id,
      name: parsed.data.name,
      contact: parsed.data.contact ?? null,
      covers: parsed.data.covers,
      notes: parsed.data.notes ?? null,
    });
    refresh();
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "backup-services").body.error.message };
  }
}

const activeSchema = z.object({ householdId: z.uuid(), id: z.uuid(), active: z.enum(["true", "false"]) });

/** Retire or restore — never a hard delete, so a cover request keeps its provider. */
export async function setBackupServiceActiveAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = activeSchema.safeParse({ householdId: formData.get("householdId"), id: formData.get("id"), active: formData.get("active") });
  if (!parsed.success) return { error: "That service could not be found." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await setBackupServiceActive(supabase, { householdId: parsed.data.householdId, id: parsed.data.id, active: parsed.data.active === "true" });
    refresh();
    return { notice: parsed.data.active === "true" ? "Restored." : "Retired. It is kept, and can be restored." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "backup-services").body.error.message };
  }
}

const arrangeSchema = z.object({
  householdId: z.uuid(),
  serviceId: z.uuid(),
  outcomeKey,
  outcomeName: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function arrangeCoverAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = arrangeSchema.safeParse({
    householdId: formData.get("householdId"),
    serviceId: formData.get("serviceId"),
    outcomeKey: formData.get("outcomeKey"),
    outcomeName: formData.get("outcomeName"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: "That cover could not be arranged. Try again." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const { created } = await arrangeCover(supabase, parsed.data);
    refresh();
    return {
      notice: created
        ? "Arranged. Give them a call to confirm — if it's still unconfirmed in two days, Home & Upkeep will bring it up."
        : "Already arranged for that day.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "backup-services").body.error.message };
  }
}
