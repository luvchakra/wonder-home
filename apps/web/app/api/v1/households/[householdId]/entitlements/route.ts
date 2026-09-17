import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { featureSummary } from "@wonderhome/core/billing/entitlements";
import { loadSubscription } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * What this household's plan allows (story 20-002).
 *
 * The same data the server enforces with, so a client can decide what to offer
 * without becoming a second source of truth. Rendering is not authorization:
 * every guarded path re-asks the entitlement service regardless of what this
 * response said.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    return featureSummary(await loadSubscription(supabase, householdId));
  })(request);
}

export const dynamic = "force-dynamic";
