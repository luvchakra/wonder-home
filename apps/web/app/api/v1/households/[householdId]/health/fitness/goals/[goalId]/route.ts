import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { dismissFitnessGoal, FITNESS_FREQUENCY_PERIODS, getFitnessGoal, reactivateFitnessGoal, updateFitnessGoal } from "@wonderhome/core/health/fitness";
import { requireMembership } from "@wonderhome/core/identity/households";

/** One fitness goal — its own content, or dismiss/bring back (story 21-008). */
type Params = { params: Promise<{ householdId: string; goalId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, goalId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const goal = await getFitnessGoal(supabase, householdId, goalId);
    if (!goal) throw ApiError.notFound("That goal could not be found.");
    return { goal };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  targetCount: z.number().int().positive().optional(),
  frequencyPeriod: z.enum(FITNESS_FREQUENCY_PERIODS).optional(),
  preferredTime: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const dismissSchema = z.object({ action: z.literal("dismiss") });
const reactivateSchema = z.object({ action: z.literal("reactivate") });

const patchSchema = z.discriminatedUnion("action", [updateSchema, dismissSchema, reactivateSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, goalId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const actor = { householdId, memberId: membership.memberId };

    if (body.action === "update") {
      const { targetCount, frequencyPeriod, preferredTime, notes } = body;
      const goal = await updateFitnessGoal(supabase, actor, goalId, { targetCount, frequencyPeriod, preferredTime, notes });
      return { goal };
    }

    if (body.action === "dismiss") {
      const goal = await dismissFitnessGoal(supabase, actor, goalId);
      return { goal };
    }

    const goal = await reactivateFitnessGoal(supabase, actor, goalId);
    return { goal };
  })(request);
}

export const dynamic = "force-dynamic";
