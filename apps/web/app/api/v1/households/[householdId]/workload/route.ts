import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { householdWorkload } from "@wonderhome/core/household/workload-repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Who carries what (story 03-008): each active member's outcomes and times a
 * week, any imbalance worth a word, and the swaps that would narrow it. Any
 * member may read it; only an Admin may accept a swap.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    return householdWorkload(supabase, householdId, membership.household.ownerMemberId);
  })(request);
}

export const dynamic = "force-dynamic";
