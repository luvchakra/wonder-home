import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { createVital, listVitals, VITAL_STATUSES, VITAL_TYPES } from "@wonderhome/core/health/vitals";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A household's vitals (story 21-007) — structured readings, always what
 * the household actually recorded.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const vitalTypeParam = url.searchParams.getAll("vitalType");
  const vitalTypes = vitalTypeParam.filter((value): value is (typeof VITAL_TYPES)[number] => (VITAL_TYPES as readonly string[]).includes(value));
  const statusParam = url.searchParams.getAll("status");
  const statuses = statusParam.filter((value): value is (typeof VITAL_STATUSES)[number] => (VITAL_STATUSES as readonly string[]).includes(value));
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const vitals = await listVitals(supabase, householdId, {
      memberId,
      vitalTypes: vitalTypes.length ? vitalTypes : undefined,
      statuses: statuses.length ? statuses : undefined,
      limit: limit && Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
    });
    return { vitals };
  })(request);
}

const createSchema = z.object({
  memberId: z.string().uuid(),
  vitalType: z.enum(VITAL_TYPES),
  customLabel: z.string().trim().min(1).max(80).optional(),
  value: z.number().finite(),
  secondaryValue: z.number().finite().optional(),
  unit: z.string().trim().min(1).max(20),
  measuredAt: z.string().datetime().optional(),
  privacyScope: z.enum(PRIVACY_SCOPES).default("private"),
  notes: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    if (body.vitalType === "custom" && !body.customLabel) {
      throw ApiError.badRequest("A custom measurement needs a name.");
    }

    const vital = await createVital(supabase, { householdId, memberId: membership.memberId }, body);

    return new Response(JSON.stringify({ vital }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
