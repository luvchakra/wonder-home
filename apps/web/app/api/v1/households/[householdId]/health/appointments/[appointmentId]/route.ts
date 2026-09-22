import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { APPOINTMENT_STATUSES, getAppointment, rescheduleAppointment, setAppointmentStatus, updateAppointment } from "@wonderhome/core/health/appointments";
import { syncCheckupForAppointment } from "@wonderhome/core/health/checkups";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * One appointment — its own details, its status, or a reschedule to a new
 * time (story 21-002). Three different operations rather than three routes,
 * because they share one entity and one authorization check; `action`
 * discriminates which one a PATCH means.
 */
type Params = { params: Promise<{ householdId: string; appointmentId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, appointmentId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const appointment = await getAppointment(supabase, householdId, appointmentId);
    if (!appointment) throw ApiError.notFound("That appointment could not be found.");
    return { appointment };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  provider: z.string().trim().max(200).nullable().optional(),
  facility: z.string().trim().max(200).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  preparationNotes: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  remindAdvance: z.boolean().optional(),
  remindPreparation: z.boolean().optional(),
  remindDayOf: z.boolean().optional(),
});

const statusSchema = z.object({
  action: z.literal("set_status"),
  status: z.enum(APPOINTMENT_STATUSES.filter((status) => status !== "rescheduled") as [string, ...string[]]),
});

const rescheduleSchema = z.object({
  action: z.literal("reschedule"),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).optional(),
});

const patchSchema = z.discriminatedUnion("action", [updateSchema, statusSchema, rescheduleSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, appointmentId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const actor = { householdId, memberId: membership.memberId };

    if (body.action === "update") {
      const { provider, facility, location, preparationNotes, notes, remindAdvance, remindPreparation, remindDayOf } = body;
      const appointment = await updateAppointment(supabase, actor, appointmentId, {
        provider,
        facility,
        location,
        preparationNotes,
        notes,
        remindAdvance,
        remindPreparation,
        remindDayOf,
      });
      return { appointment };
    }

    if (body.action === "set_status") {
      const appointment = await setAppointmentStatus(supabase, actor, appointmentId, body.status as Exclude<(typeof APPOINTMENT_STATUSES)[number], "rescheduled">);
      await syncCheckupForAppointment(supabase, actor, appointment);
      return { appointment };
    }

    const current = await getAppointment(supabase, householdId, appointmentId);
    if (!current) throw ApiError.notFound("That appointment could not be found.");

    const { data: memberRow, error: memberError } = await supabase.from("household_members").select("display_name").eq("household_id", householdId).eq("id", current.memberId).maybeSingle();
    if (memberError || !memberRow) throw ApiError.badRequest("That person is not part of this household.");

    const result = await rescheduleAppointment(supabase, actor, appointmentId, {
      memberDisplayName: (memberRow as { display_name: string }).display_name,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
    });
    return result;
  })(request);
}

export const dynamic = "force-dynamic";
