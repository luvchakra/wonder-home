import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { PRIVACY_SCOPES, getHealthProfile, setHealthProfile } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A member's own health-domain settings (story 21-001).
 *
 * `memberId` is a query/body parameter rather than always "the caller",
 * because a guardian manages a child's health settings too — RLS is what
 * actually decides whether the caller may read or write the row named.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const targetMemberId = memberId ?? membership.memberId;
    const profile = await getHealthProfile(supabase, householdId, targetMemberId);
    return { profile };
  })(request);
}

const patchSchema = z.object({
  memberId: z.string().uuid(),
  privacyScope: z.enum(PRIVACY_SCOPES).optional(),
  aiAssistanceEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const profile = await setHealthProfile(supabase, { householdId, memberId: membership.memberId }, body);
    return { profile };
  })(request);
}

export const dynamic = "force-dynamic";
