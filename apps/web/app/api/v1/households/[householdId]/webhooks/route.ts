import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { isHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { WEBHOOK_EVENT_TYPES } from "@wonderhome/core/webhooks/event";
import { createWebhookSubscription, listWebhookSubscriptions } from "@wonderhome/core/webhooks/repository";

/**
 * A household's outbound webhook subscriptions (story 18-007).
 *
 * GET is open to any member — `list_webhook_subscriptions()` never returns
 * the signing secret. POST is admin-only, and its response is the one and
 * only time the secret is ever readable: `household_webhooks` has no
 * SELECT policy at all, the same exception `household_ai_credentials`
 * already makes.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const subscriptions = await listWebhookSubscriptions(supabase, householdId);
    return { subscriptions };
  })(request);
}

const createSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const subscription = await createWebhookSubscription(
      createAdminClient(),
      { householdId, memberId: membership.memberId, isAdmin: isHouseholdAdmin(membership) },
      body,
    );

    return new Response(JSON.stringify({ subscription }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
