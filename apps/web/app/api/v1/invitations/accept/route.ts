import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { acceptInvitation } from "@wonderhome/core/identity/invitations";

const acceptSchema = z.object({
  token: z.string().min(20),
  displayName: z.string().trim().min(1).max(80).optional(),
});

/** Joins the signed-in person to a household using an invitation token. */
export const POST = defineRoute({ input: acceptSchema }, async ({ body }) => {
  await requireUser();
  const supabase = await createClient();
  return acceptInvitation(supabase, body.token, body.displayName);
});

export const dynamic = "force-dynamic";
