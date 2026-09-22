import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { grantHealthConsent, listHealthConsents } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Who a household member has shared their health data with (story 21-001).
 *
 * Read and write both go through the household's own RLS-scoped client:
 * `health_consents_select_party`/`_write_subject_or_guardian` are the
 * authoritative word on who may list or grant, not this route.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const subjectMemberId = url.searchParams.get("subjectMemberId");

  return defineRoute({}, async () => {
    await requireUser();
    if (!subjectMemberId) throw ApiError.badRequest("subjectMemberId is required.");

    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const consents = await listHealthConsents(supabase, householdId, subjectMemberId);
    return { consents };
  })(request);
}

const postSchema = z.object({
  subjectMemberId: z.string().uuid(),
  viewerMemberId: z.string().uuid(),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: postSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const consent = await grantHealthConsent(supabase, { householdId, memberId: membership.memberId }, body);
    return new Response(JSON.stringify({ consent }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
