import { householdPredictions } from "@wonderhome/core/ai/predictions-repository";
import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Looking ahead (story 14-008): the next two weeks' risks and opportunities,
 * predicted from what the caller may already read. Read-only — a prediction
 * is never written, and never a fact.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    return { predictions: await householdPredictions(supabase, householdId, membership.household.ownerMemberId) };
  })(request);
}

export const dynamic = "force-dynamic";
