import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { acceptRebalance, rebalanceSchema } from "@wonderhome/core/household/workload-repository";
import { listMembers, requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Accepts one suggested swap (story 03-008): the outcome's backup becomes its
 * owner and the owner its backup, through the same validated, audited save
 * as any responsibility change. Accepting it twice changes nothing; a swap
 * that no longer matches the household is refused.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: rebalanceSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);
    const members = await listMembers(supabase, householdId, membership.household.ownerMemberId);
    return acceptRebalance(supabase, { householdId, actorMemberId: membership.memberId, members, ...body });
  })(request);
}

export const dynamic = "force-dynamic";
