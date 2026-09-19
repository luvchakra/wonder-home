import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { usageSummary } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * What this household's plan allows, and what it has used (stories 20-002, 20-005).
 *
 * The same counters the entitlement service enforces against, so a client can
 * show "140 of 500 this month" without holding a second copy of the number
 * that could drift from the one quotas are actually checked against.
 * Rendering is not authorization: every guarded path re-asks the entitlement
 * service regardless of what this response said.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    return usageSummary(supabase, householdId);
  })(request);
}

export const dynamic = "force-dynamic";
