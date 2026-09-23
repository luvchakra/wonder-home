import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { createFitnessSession, FITNESS_ACTIVITY_TYPES, FITNESS_SESSION_STATUSES, listFitnessSessions } from "@wonderhome/core/health/fitness";
import { HEALTH_PROVIDER_IDS } from "@wonderhome/core/health/health-provider";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A household's fitness sessions (story 21-008) — a single logged activity,
 * always what the household actually did.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const goalId = url.searchParams.get("goalId") ?? undefined;
  const statusParam = url.searchParams.getAll("status");
  const statuses = statusParam.filter((value): value is (typeof FITNESS_SESSION_STATUSES)[number] => (FITNESS_SESSION_STATUSES as readonly string[]).includes(value));
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const sessions = await listFitnessSessions(supabase, householdId, {
      memberId,
      goalId,
      statuses: statuses.length ? statuses : undefined,
      limit: limit && Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
    });
    return { sessions };
  })(request);
}

const createSchema = z.object({
  memberId: z.string().uuid(),
  goalId: z.string().uuid().optional(),
  activityType: z.enum(FITNESS_ACTIVITY_TYPES),
  customLabel: z.string().trim().min(1).max(80).optional(),
  durationMinutes: z.number().int().positive(),
  distanceValue: z.number().positive().optional(),
  distanceUnit: z.string().trim().min(1).max(20).optional(),
  startedAt: z.string().datetime().optional(),
  privacyScope: z.enum(PRIVACY_SCOPES).default("private"),
  notes: z.string().trim().max(1000).optional(),
  providerId: z.enum(HEALTH_PROVIDER_IDS).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    if (body.activityType === "other" && !body.customLabel) {
      throw ApiError.badRequest("A custom activity needs a name.");
    }
    if ((body.distanceValue !== undefined) !== (body.distanceUnit !== undefined)) {
      throw ApiError.badRequest("A distance needs both a value and a unit.");
    }

    const session = await createFitnessSession(supabase, { householdId, memberId: membership.memberId }, body);

    return new Response(JSON.stringify({ session }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
