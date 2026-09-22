import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { completeRoutine, dismissRoutine, getRoutine, reactivateRoutine, updateRoutine } from "@wonderhome/core/health/measurement-routines";
import { requireMembership } from "@wonderhome/core/identity/households";

/** One measurement routine — its own content, or a move through its lifecycle (story 21-007). */
type Params = { params: Promise<{ householdId: string; routineId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, routineId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const routine = await getRoutine(supabase, householdId, routineId);
    if (!routine) throw ApiError.notFound("That routine could not be found.");
    return { routine };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  cadenceDays: z.number().int().positive().optional(),
  preferredTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const completeSchema = z.object({
  action: z.literal("complete"),
  value: z.number().finite(),
  secondaryValue: z.number().finite().optional(),
  unit: z.string().trim().min(1).max(20),
  notes: z.string().trim().max(1000).optional(),
  completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const dismissSchema = z.object({ action: z.literal("dismiss") });
const reactivateSchema = z.object({ action: z.literal("reactivate") });

const patchSchema = z.discriminatedUnion("action", [updateSchema, completeSchema, dismissSchema, reactivateSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, routineId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const actor = { householdId, memberId: membership.memberId };

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    if (body.action === "update") {
      const { cadenceDays, preferredTime, reminderEnabled, notes, nextDueOn } = body;
      const routine = await updateRoutine(supabase, actor, routineId, { cadenceDays, preferredTime, reminderEnabled, notes, nextDueOn });
      return { routine };
    }

    if (body.action === "complete") {
      const { value, secondaryValue, unit, notes, completedOn } = body;
      const result = await completeRoutine(supabase, actor, routineId, { value, secondaryValue, unit, notes }, completedOn);
      return result;
    }

    if (body.action === "dismiss") {
      const routine = await dismissRoutine(supabase, actor, routineId);
      return { routine };
    }

    const routine = await reactivateRoutine(supabase, actor, routineId);
    return { routine };
  })(request);
}

export const dynamic = "force-dynamic";
