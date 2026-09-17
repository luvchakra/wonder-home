import { z } from "zod";

import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { grantSupportAccess, requirePlatformAdmin } from "@wonderhome/core/platform/admin";

const grantSchema = z.object({
  householdId: z.uuid(),
  reasonCode: z.enum([
    "user_reported_issue",
    "billing_dispute",
    "data_correction",
    "security_investigation",
    "legal_request",
  ]),
  reasonNote: z.string().trim().min(10).max(500),
  scope: z.enum(["read", "write"]).default("read"),
  hours: z.number().int().min(1).max(24).optional(),
});

/**
 * Grants time-boxed access to one household (story 16-004).
 *
 * The grant is written where the household can read it, and audited, so the
 * family can see who looked at their home and why.
 */
export const POST = defineRoute({ input: grantSchema }, async ({ body, requestId }) => {
  const supabase = await createClient();
  const actor = await requirePlatformAdmin(supabase);

  const granted = await grantSupportAccess(createAdminClient(), actor, body, requestId);

  return new Response(JSON.stringify(granted), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
});

export const dynamic = "force-dynamic";
