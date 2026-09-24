import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { cancelAtPeriodEnd } from "@wonderhome/core/billing/account";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Ends the household's paid plan at the end of the period it is paid for
 * (story 20-010, spec §19). An Admin asks; the provider is told; the plan
 * stays until the period ends and the provider's own webhook moves the
 * household to Free then. Nothing is refunded and nothing is deleted.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);
    const { periodEnd } = await cancelAtPeriodEnd(createAdminClient(), { householdId, memberId: membership.memberId });
    return { cancelAtPeriodEnd: true, periodEnd: periodEnd?.toISOString() ?? null };
  })(request);
}

export const dynamic = "force-dynamic";
