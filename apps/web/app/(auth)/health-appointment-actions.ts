"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  createAppointment,
  rescheduleAppointment,
  setAppointmentStatus,
} from "@wonderhome/core/health/appointments";
import { syncCheckupForAppointment } from "@wonderhome/core/health/checkups";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/** Booking, confirming, completing, cancelling and rescheduling a health appointment (story 21-002). */
const createSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  memberDisplayName: z.string().trim().min(1).max(160),
  appointmentType: z.enum(APPOINTMENT_TYPES),
  privacyScope: z.enum(PRIVACY_SCOPES),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  provider: z.string().trim().max(200).optional(),
  facility: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  preparationNotes: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
  remindAdvance: z.enum(["true", "false"]).optional(),
  remindPreparation: z.enum(["true", "false"]).optional(),
  remindDayOf: z.enum(["true", "false"]).optional(),
  calendarSync: z.enum(["true", "false"]).optional(),
  checkupId: z.uuid().optional(),
});

function readForm(formData: FormData) {
  return {
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    memberDisplayName: formData.get("memberDisplayName"),
    appointmentType: formData.get("appointmentType"),
    privacyScope: formData.get("privacyScope"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") || undefined,
    provider: formData.get("provider") || undefined,
    facility: formData.get("facility") || undefined,
    location: formData.get("location") || undefined,
    preparationNotes: formData.get("preparationNotes") || undefined,
    notes: formData.get("notes") || undefined,
    remindAdvance: formData.get("remindAdvance") || undefined,
    remindPreparation: formData.get("remindPreparation") || undefined,
    remindDayOf: formData.get("remindDayOf") || undefined,
    calendarSync: formData.get("calendarSync") || undefined,
    checkupId: formData.get("checkupId") || undefined,
  };
}

const FRIENDLY_FIELD_ERROR: Record<string, string> = {
  startsAt: "Choose when this starts.",
  memberDisplayName: "Choose who this is for.",
};

export async function createAppointmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue ? String(issue.path[0] ?? "") : "";
    return { error: (field && FRIENDLY_FIELD_ERROR[field]) || issue?.message || "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const startsAt = new Date(parsed.data.startsAt).toISOString();
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : undefined;

    const result = await createAppointment(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId: parsed.data.memberId,
      memberDisplayName: parsed.data.memberDisplayName,
      appointmentType: parsed.data.appointmentType,
      privacyScope: parsed.data.privacyScope,
      startsAt,
      endsAt,
      provider: parsed.data.provider,
      facility: parsed.data.facility,
      location: parsed.data.location,
      preparationNotes: parsed.data.preparationNotes,
      notes: parsed.data.notes,
      remindAdvance: parsed.data.remindAdvance === "true",
      remindPreparation: parsed.data.remindPreparation === "true",
      remindDayOf: parsed.data.remindDayOf !== "false",
      checkupId: parsed.data.checkupId,
      calendarSync: parsed.data.calendarSync === "true",
    });

    revalidatePath("/health");

    const warnings: string[] = [];
    if (result.duplicateOf) warnings.push("This looks similar to one already on the list — booked anyway, since a real follow-up does happen.");
    if (result.conflicts.length > 0) warnings.push(`${result.conflicts.length === 1 ? "Something else is" : "Some things are"} booked at the same time.`);

    return { notice: warnings.length ? `Booked. ${warnings.join(" ")}` : "Booked." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-appointments").body.error.message };
  }
}

const statusSchema = z.object({
  householdId: z.uuid(),
  appointmentId: z.uuid(),
  status: z.enum(APPOINTMENT_STATUSES.filter((status) => status !== "rescheduled") as [string, ...string[]]),
});

export async function setAppointmentStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse({
    householdId: formData.get("householdId"),
    appointmentId: formData.get("appointmentId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const actor = { householdId: parsed.data.householdId, memberId: membership.memberId };

    const appointment = await setAppointmentStatus(
      supabase,
      actor,
      parsed.data.appointmentId,
      parsed.data.status as Exclude<(typeof APPOINTMENT_STATUSES)[number], "rescheduled">,
    );
    await syncCheckupForAppointment(supabase, actor, appointment);

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-appointments").body.error.message };
  }
}

const rescheduleSchema = z.object({
  householdId: z.uuid(),
  appointmentId: z.uuid(),
  memberDisplayName: z.string().trim().min(1).max(160),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
});

export async function rescheduleAppointmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = rescheduleSchema.safeParse({
    householdId: formData.get("householdId"),
    appointmentId: formData.get("appointmentId"),
    memberDisplayName: formData.get("memberDisplayName"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await rescheduleAppointment(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.appointmentId, {
      memberDisplayName: parsed.data.memberDisplayName,
      startsAt: new Date(parsed.data.startsAt).toISOString(),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : undefined,
    });

    revalidatePath("/health");
    return { notice: "Rescheduled." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-appointments").body.error.message };
  }
}
