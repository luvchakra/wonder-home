"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import {
  createHelperEngagement,
  recordAvailabilityException,
  removeHelperEngagement,
  replaceAvailabilityPattern,
  updateHelperEngagement,
} from "@wonderhome/core/household/helpers-repository";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * A househelper's arrangement, by hand. Before this, `helper_profiles` and
 * `member_availability` were read on the Househelper screen and written by
 * nothing anywhere — a "No pattern recorded" that no one could ever record.
 * Leave had one route, the AI chat, which could prepare the change but had
 * nothing wired to carry it out.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." });
const clock = z.string().regex(/^\d{2}:\d{2}$/, { error: "Use HH:MM." });

const profileSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  engagement: z.enum(["regular", "occasional", "service"]),
  startedOn: z.union([isoDate, z.literal("")]).optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Adding a new, distinct engagement for a helper who may already have one or more. */
export async function createHelperEngagementAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    engagement: formData.get("engagement"),
    startedOn: formData.get("startedOn") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await createHelperEngagement(supabase, {
      householdId: parsed.data.householdId,
      memberId: parsed.data.memberId,
      engagement: parsed.data.engagement,
      startedOn: parsed.data.startedOn || null,
      notes: parsed.data.notes || null,
    });
    revalidatePath("/househelper");
    return { notice: "Added." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "househelper").body.error.message };
  }
}

const updateProfileSchema = profileSchema.extend({ id: z.uuid() });

/** Changing one already-recorded engagement, by its own id. */
export async function updateHelperEngagementAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateProfileSchema.safeParse({
    id: formData.get("id"),
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    engagement: formData.get("engagement"),
    startedOn: formData.get("startedOn") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await updateHelperEngagement(supabase, {
      id: parsed.data.id,
      householdId: parsed.data.householdId,
      engagement: parsed.data.engagement,
      startedOn: parsed.data.startedOn || null,
      notes: parsed.data.notes || null,
    });
    revalidatePath("/househelper");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "househelper").body.error.message };
  }
}

const removeProfileSchema = z.object({ id: z.uuid(), householdId: z.uuid() });

/** Removing one engagement — a helper's other engagements, if any, are untouched. */
export async function removeHelperEngagementAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = removeProfileSchema.safeParse({
    id: formData.get("id"),
    householdId: formData.get("householdId"),
  });
  if (!parsed.success) return { error: "Something is missing." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await removeHelperEngagement(supabase, parsed.data);
    revalidatePath("/househelper");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "househelper").body.error.message };
  }
}

const patternSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  days: z.array(z.coerce.number().int().min(0).max(6)),
  startTime: clock,
  endTime: clock,
});

export async function setAvailabilityPatternAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = patternSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    days: formData.getAll("days"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if (parsed.data.days.length === 0) return { error: "Pick at least one day." };
  if (parsed.data.startTime >= parsed.data.endTime) return { error: "The day has to end after it starts." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await replaceAvailabilityPattern(supabase, {
      householdId: parsed.data.householdId,
      memberId: parsed.data.memberId,
      windows: [...new Set(parsed.data.days)].map((dayOfWeek) => ({ dayOfWeek, startTime: parsed.data.startTime, endTime: parsed.data.endTime })),
    });
    revalidatePath("/househelper");
    return { notice: "Pattern saved. WonderHome will expect them on those days." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "househelper").body.error.message };
  }
}

const exceptionSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid({ error: "Choose who this is about." }),
  onDate: isoDate,
  available: z.enum(["away", "extra"]),
  reason: z.string().trim().max(200).optional(),
});

export async function recordLeaveAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = exceptionSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    onDate: formData.get("onDate"),
    available: formData.get("available"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await recordAvailabilityException(supabase, {
      householdId: parsed.data.householdId,
      memberId: parsed.data.memberId,
      onDate: parsed.data.onDate,
      available: parsed.data.available === "extra",
      reason: parsed.data.reason || null,
    });
    revalidatePath("/househelper");
    revalidatePath("/today");
    revalidatePath("/");
    return {
      notice:
        parsed.data.available === "extra"
          ? "Recorded as an extra day."
          : "Recorded. What they normally handle that day will show as needing cover.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "househelper").body.error.message };
  }
}
