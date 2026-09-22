import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { isHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { disableWebhookSubscription, enableWebhookSubscription, rotateWebhookSecret } from "@wonderhome/core/webhooks/repository";

/**
 * Rotating or turning off a household's webhook (story 18-007). "Turning
 * off" is this entity's "remove" (CLAUDE.md rule 12) — never a hard delete,
 * since a queued delivery still references it.
 */
type Params = { params: Promise<{ householdId: string; webhookId: string }> };

const patchSchema = z.object({ action: z.enum(["rotate", "disable", "enable"]) });

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, webhookId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const actor = { householdId, memberId: membership.memberId, isAdmin: isHouseholdAdmin(membership) };
    const admin = createAdminClient();

    switch (body.action) {
      case "rotate": {
        const subscription = await rotateWebhookSecret(admin, actor, webhookId);
        return { subscription };
      }
      case "disable": {
        const subscription = await disableWebhookSubscription(admin, actor, webhookId);
        return { subscription };
      }
      case "enable": {
        const subscription = await enableWebhookSubscription(admin, actor, webhookId);
        return { subscription };
      }
      default:
        throw ApiError.badRequest("Not a real action.");
    }
  })(request);
}

export const dynamic = "force-dynamic";
