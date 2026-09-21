import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { runHouseholdAgents } from "@wonderhome/core/ai/run";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Triggers a real run of the household's specialists (14-007, made live).
 *
 * Any member may ask WonderHome to check on things — the same request
 * "check on things" makes through HomeTalk. What each proposed step is
 * actually allowed to do is decided per step, inside the run, by the same
 * tool gate every other write goes through; this endpoint only starts the
 * run and reports what happened.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const summary = await runHouseholdAgents(supabase, householdId, {
      memberId: membership.memberId,
      roles: membership.roles,
      memberType: membership.memberType,
    });

    return { summary };
  })(request);
}

export const dynamic = "force-dynamic";
