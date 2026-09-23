import { defineRoute } from "@wonderhome/core/api/route";
import { requireUser } from "@wonderhome/core/api/auth";
import { createClient } from "@wonderhome/core/db/server";
import { homeAgenda } from "@wonderhome/core/home/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * What the home domain currently needs from this household (module 13).
 *
 * An empty response is the expected, healthy answer — the house is working, the
 * uniforms will be ready, the cat has food. The client is expected to say so
 * rather than render four empty lists.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    // The household's own weather is used when the deployment has a provider,
    // an Admin chose an area and the plan includes it (story 17-007) — decided
    // inside, so this route cannot plan with weather the screen would refuse.
    return await homeAgenda(supabase, householdId);
  })(request);
}

export const dynamic = "force-dynamic";
