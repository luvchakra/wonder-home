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

    // No forecast is passed: weather-aware planning is entitlement-gated and
    // has no live provider, so drying is assessed under ordinary conditions.
    return await homeAgenda(supabase, householdId);
  })(request);
}

export const dynamic = "force-dynamic";
