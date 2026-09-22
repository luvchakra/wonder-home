import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { CHECKUP_SOURCES, CHECKUP_STATUSES, CHECKUP_TYPES, createCheckup, listCheckups } from "@wonderhome/core/health/checkups";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A household's checkups & preventive care (story 21-004) — a household-
 * defined recurring commitment, never a schedule WonderHome invents.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const statusParam = url.searchParams.getAll("status");
  const statuses = statusParam.filter((value): value is (typeof CHECKUP_STATUSES)[number] => (CHECKUP_STATUSES as readonly string[]).includes(value));

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const checkups = await listCheckups(supabase, householdId, { memberId, statuses: statuses.length ? statuses : undefined });
    return { checkups };
  })(request);
}

const createSchema = z.object({
  memberId: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
  checkupType: z.enum(CHECKUP_TYPES),
  source: z.enum(CHECKUP_SOURCES).optional(),
  cadenceDays: z.number().int().positive().nullable().optional(),
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

    const checkup = await createCheckup(supabase, { householdId, memberId: membership.memberId }, body);

    return new Response(JSON.stringify({ checkup }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
