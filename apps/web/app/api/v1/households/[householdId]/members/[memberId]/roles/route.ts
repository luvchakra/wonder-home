import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership, setMemberRole } from "@wonderhome/core/identity/households";

const roleChangeSchema = z.object({
  role: z.enum(["administrator", "adult", "child", "helper"]),
  granted: z.boolean(),
});

type Params = { params: Promise<{ householdId: string; memberId: string }> };

/**
 * Grants or revokes a role. Head is not assignable here — transferring
 * ownership is its own operation, not a role grant.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { householdId, memberId } = await params;

  return defineRoute({ input: roleChangeSchema }, async ({ body }) => {
    await requireUser();
    const supabase = await createClient();
    const actor = await requireMembership(supabase, householdId);

    await setMemberRole(supabase, actor, { memberId, ...body });
    return { memberId, role: body.role, granted: body.granted };
  })(request);
}

export const dynamic = "force-dynamic";
