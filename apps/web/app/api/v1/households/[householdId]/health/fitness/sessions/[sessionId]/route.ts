import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { archiveFitnessSession, getFitnessSession, reactivateFitnessSession, updateFitnessSession } from "@wonderhome/core/health/fitness";
import { requireMembership } from "@wonderhome/core/identity/households";

/** One fitness session — its own content, or archive/bring back (story 21-008). */
type Params = { params: Promise<{ householdId: string; sessionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, sessionId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const session = await getFitnessSession(supabase, householdId, sessionId);
    if (!session) throw ApiError.notFound("That session could not be found.");
    return { session };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  durationMinutes: z.number().int().positive().optional(),
  distanceValue: z.number().positive().nullable().optional(),
  distanceUnit: z.string().trim().min(1).max(20).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const archiveSchema = z.object({ action: z.literal("archive") });
const reactivateSchema = z.object({ action: z.literal("reactivate") });

const patchSchema = z.discriminatedUnion("action", [updateSchema, archiveSchema, reactivateSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, sessionId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const actor = { householdId, memberId: membership.memberId };

    if (body.action === "update") {
      if ((body.distanceValue !== undefined) !== (body.distanceUnit !== undefined)) {
        throw ApiError.badRequest("A distance needs both a value and a unit.");
      }
      const { durationMinutes, distanceValue, distanceUnit, startedAt, notes } = body;
      const session = await updateFitnessSession(supabase, actor, sessionId, { durationMinutes, distanceValue, distanceUnit, startedAt, notes });
      return { session };
    }

    if (body.action === "archive") {
      const session = await archiveFitnessSession(supabase, actor, sessionId);
      return { session };
    }

    const session = await reactivateFitnessSession(supabase, actor, sessionId);
    return { session };
  })(request);
}

export const dynamic = "force-dynamic";
