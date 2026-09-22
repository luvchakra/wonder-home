import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { archiveVital, getVital, reactivateVital, updateVital } from "@wonderhome/core/health/vitals";
import { requireMembership } from "@wonderhome/core/identity/households";

/** One vital reading — its own content, or archive/bring back (story 21-007). */
type Params = { params: Promise<{ householdId: string; vitalId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, vitalId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const vital = await getVital(supabase, householdId, vitalId);
    if (!vital) throw ApiError.notFound("That reading could not be found.");
    return { vital };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  value: z.number().finite().optional(),
  secondaryValue: z.number().finite().nullable().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  measuredAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const archiveSchema = z.object({ action: z.literal("archive") });
const reactivateSchema = z.object({ action: z.literal("reactivate") });

const patchSchema = z.discriminatedUnion("action", [updateSchema, archiveSchema, reactivateSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, vitalId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const actor = { householdId, memberId: membership.memberId };

    if (body.action === "update") {
      const { value, secondaryValue, unit, measuredAt, notes } = body;
      const vital = await updateVital(supabase, actor, vitalId, { value, secondaryValue, unit, measuredAt, notes });
      return { vital };
    }

    if (body.action === "archive") {
      const vital = await archiveVital(supabase, actor, vitalId);
      return { vital };
    }

    const vital = await reactivateVital(supabase, actor, vitalId);
    return { vital };
  })(request);
}

export const dynamic = "force-dynamic";
