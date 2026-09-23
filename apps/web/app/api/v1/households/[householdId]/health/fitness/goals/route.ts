import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { createFitnessGoal, FITNESS_ACTIVITY_TYPES, FITNESS_FREQUENCY_PERIODS, FITNESS_GOAL_STATUSES, listFitnessGoals } from "@wonderhome/core/health/fitness";
import { HEALTH_PROVIDER_IDS } from "@wonderhome/core/health/health-provider";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A household's fitness goals (story 21-008) — lightweight and
 * consistency-oriented, never scored.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const statusParam = url.searchParams.getAll("status");
  const statuses = statusParam.filter((value): value is (typeof FITNESS_GOAL_STATUSES)[number] => (FITNESS_GOAL_STATUSES as readonly string[]).includes(value));

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const goals = await listFitnessGoals(supabase, householdId, { memberId, statuses: statuses.length ? statuses : undefined });
    return { goals };
  })(request);
}

const createSchema = z.object({
  memberId: z.string().uuid(),
  activityType: z.enum(FITNESS_ACTIVITY_TYPES),
  customLabel: z.string().trim().min(1).max(80).optional(),
  targetCount: z.number().int().positive(),
  frequencyPeriod: z.enum(FITNESS_FREQUENCY_PERIODS),
  preferredTime: z.string().trim().optional(),
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

    const goal = await createFitnessGoal(supabase, { householdId, memberId: membership.memberId }, body);

    return new Response(JSON.stringify({ goal }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
