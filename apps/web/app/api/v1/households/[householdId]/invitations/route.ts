import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { supabaseIdempotencyStore } from "@wonderhome/core/api/idempotency";
import { createInvitation, listInvitations } from "@wonderhome/core/identity/invitations";

const inviteSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  displayName: z.string().trim().min(1).max(80),
  memberType: z.enum(["adult", "helper"]).default("adult"),
  role: z.enum(["administrator", "adult", "helper"]).default("adult"),
});

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);
    return { invitations: await listInvitations(supabase, householdId) };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({
    input: inviteSchema,
    authenticate: requireUser,
    idempotency: async () => {
      const supabase = await createClient();
      return supabaseIdempotencyStore(supabase, householdId);
    },
  }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);

    // Only the household's owner may create another Admin, matching the RLS policy.
    if (body.role === "administrator" && !membership.roles.includes("head")) {
      const { ApiError } = await import("@wonderhome/core/api/errors");
      throw ApiError.forbidden("Only the household's owner can invite another Admin.");
    }

    const invitation = await createInvitation(supabase, membership.memberId, {
      householdId,
      ...body,
    });

    // The token is returned exactly once. There is no email provider yet, and
    // claiming one would be a fake integration, so the caller delivers the link.
    return new Response(JSON.stringify(invitation), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
