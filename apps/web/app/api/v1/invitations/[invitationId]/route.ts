import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { revokeInvitation } from "@wonderhome/core/identity/invitations";

type Params = { params: Promise<{ invitationId: string }> };

/**
 * Revokes an invitation. RLS restricts the update to administrators of the
 * owning household, so a revoke for someone else's invitation changes nothing.
 */
export async function DELETE(request: Request, { params }: Params) {
  const { invitationId } = await params;
  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await revokeInvitation(supabase, invitationId);
    return { revoked: true };
  })(request);
}

export const dynamic = "force-dynamic";
