import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import {
  CHECKUP_TYPES,
  completeCheckup,
  dismissCheckup,
  getCheckup,
  reactivateCheckup,
  rescheduleCheckup,
  updateCheckup,
} from "@wonderhome/core/health/checkups";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * One checkup — its own details, a reschedule, marking it done, or removing
 * it and bringing it back (story 21-004). `action` discriminates which one
 * a PATCH means, the same pattern the appointments route already uses.
 */
type Params = { params: Promise<{ householdId: string; checkupId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, checkupId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const checkup = await getCheckup(supabase, householdId, checkupId);
    if (!checkup) throw ApiError.notFound("That checkup could not be found.");
    return { checkup };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  label: z.string().trim().min(1).max(160).optional(),
  checkupType: z.enum(CHECKUP_TYPES).optional(),
  cadenceDays: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const rescheduleSchema = z.object({
  action: z.literal("reschedule"),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const completeSchema = z.object({
  action: z.literal("complete"),
  completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const dismissSchema = z.object({ action: z.literal("dismiss") });
const reactivateSchema = z.object({ action: z.literal("reactivate") });

const patchSchema = z.discriminatedUnion("action", [updateSchema, rescheduleSchema, completeSchema, dismissSchema, reactivateSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, checkupId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const actor = { householdId, memberId: membership.memberId };

    if (body.action === "update") {
      const { label, checkupType, cadenceDays, notes } = body;
      const checkup = await updateCheckup(supabase, actor, checkupId, { label, checkupType, cadenceDays, notes });
      return { checkup };
    }

    if (body.action === "reschedule") {
      const checkup = await rescheduleCheckup(supabase, actor, checkupId, body.nextDueOn);
      return { checkup };
    }

    if (body.action === "complete") {
      const checkup = body.completedOn ? await completeCheckup(supabase, actor, checkupId, body.completedOn) : await completeCheckup(supabase, actor, checkupId);
      return { checkup };
    }

    if (body.action === "dismiss") {
      const checkup = await dismissCheckup(supabase, actor, checkupId);
      return { checkup };
    }

    const checkup = await reactivateCheckup(supabase, actor, checkupId);
    return { checkup };
  })(request);
}

export const dynamic = "force-dynamic";
