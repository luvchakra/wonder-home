import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { createRoutine, listRoutines, ROUTINE_STATUSES } from "@wonderhome/core/health/measurement-routines";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { VITAL_TYPES } from "@wonderhome/core/health/vitals";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A household's measurement routines (story 21-007) — a recurring
 * commitment the household configured, never one WonderHome invented.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const statusParam = url.searchParams.getAll("status");
  const statuses = statusParam.filter((value): value is (typeof ROUTINE_STATUSES)[number] => (ROUTINE_STATUSES as readonly string[]).includes(value));

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const routines = await listRoutines(supabase, householdId, { memberId, statuses: statuses.length ? statuses : undefined });
    return { routines };
  })(request);
}

const createSchema = z.object({
  memberId: z.string().uuid(),
  vitalType: z.enum(VITAL_TYPES),
  customLabel: z.string().trim().min(1).max(80).optional(),
  cadenceDays: z.number().int().positive(),
  preferredTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  reminderEnabled: z.boolean().default(true),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

    const routine = await createRoutine(supabase, { householdId, memberId: membership.memberId }, body);

    return new Response(JSON.stringify({ routine }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
