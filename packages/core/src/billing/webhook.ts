import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { recordBillingEvent } from "./checkout";
import type { BillingProvider } from "./provider";
import { WebhookSignatureError } from "./stripe";

/**
 * The billing provider's webhook, end to end (story 20-006).
 *
 * Provider-authenticated, not household-authenticated: the only thing that
 * makes a delivery believable is its signature over the exact raw body, so
 * the body is read as text and verified before anything else happens. A
 * delivery that fails verification changes nothing and says nothing about
 * why beyond "rejected".
 *
 * Unconfigured, it answers 404 — the same thing any caller sees for an
 * endpoint that does not exist here.
 */
export async function handleBillingWebhook(
  request: Request,
  deps: { provider: BillingProvider | null; admin: () => SupabaseClient; now?: Date },
): Promise<Response> {
  if (!deps.provider?.live) return json(404, { error: "not_found" });

  const rawBody = await request.text();
  let event;
  try {
    event = await deps.provider.readWebhook(rawBody, request.headers, deps.now);
  } catch (thrown) {
    if (thrown instanceof WebhookSignatureError) {
      log.warn("billing webhook rejected", { provider: deps.provider.name });
      return json(400, { error: "rejected" });
    }
    // Unparseable after a valid signature: the provider's problem to resend.
    log.warn("billing webhook unreadable", { provider: deps.provider.name, reason: thrown instanceof Error ? thrown.name : "unknown" });
    return json(400, { error: "unreadable" });
  }

  if (!event) return json(200, { received: true, acted: false });

  const result = await recordBillingEvent(deps.admin(), deps.provider.name, event);
  return json(200, { received: true, acted: result.recorded && result.applied, duplicate: !result.recorded });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
