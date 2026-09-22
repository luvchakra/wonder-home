import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { revokeHealthConsent } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/** Revoking a health-sharing grant (story 21-001) — this entity's "remove", never a bulk clear. */
type Params = { params: Promise<{ householdId: string; consentId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const { householdId, consentId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    await revokeHealthConsent(supabase, { householdId, memberId: membership.memberId }, consentId);
    return { revoked: true };
  })(request);
}

export const dynamic = "force-dynamic";
