import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, createAppointment, listAppointments } from "@wonderhome/core/health/appointments";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A household's health appointments (story 21-002).
 *
 * Progressive entry on the client (who → what → when → where → notes →
 * reminder → save) all lands in one POST — the route validates the whole
 * shape at once, which is what "never a giant form" means for the API even
 * though the form itself is a sequence of small steps.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const statusParam = url.searchParams.getAll("status");
  const statuses = statusParam.filter((value): value is (typeof APPOINTMENT_STATUSES)[number] => (APPOINTMENT_STATUSES as readonly string[]).includes(value));

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const appointments = await listAppointments(supabase, householdId, { memberId, statuses: statuses.length ? statuses : undefined });
    return { appointments };
  })(request);
}

const createSchema = z.object({
  memberId: z.string().uuid(),
  appointmentType: z.enum(APPOINTMENT_TYPES),
  privacyScope: z.enum(PRIVACY_SCOPES).default("private"),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  provider: z.string().trim().max(200).optional(),
  facility: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  preparationNotes: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
  remindAdvance: z.boolean().optional(),
  remindPreparation: z.boolean().optional(),
  remindDayOf: z.boolean().optional(),
  calendarSync: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const { data: memberRow, error: memberError } = await supabase.from("household_members").select("display_name").eq("household_id", householdId).eq("id", body.memberId).maybeSingle();
    if (memberError || !memberRow) throw ApiError.badRequest("That person is not part of this household.");

    const result = await createAppointment(supabase, { householdId, memberId: membership.memberId }, {
      ...body,
      memberDisplayName: (memberRow as { display_name: string }).display_name,
    });

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
