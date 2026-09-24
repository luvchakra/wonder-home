import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { recordBillingEvent } from "./checkout";
import type { BillingProvider } from "./provider";
import { WebhookSignatureError } from "./signature";

/**
 * The billing provider's webhook, end to end (story 20-006).
 *
 * Provider-authenticated, not household-authenticated: the only thing that
 * makes a delivery believable is its signature over the exact raw body, so
 * the body is read as text and verified before anything else happens. A
 * delivery that fails verification changes nothing and says nothing about
 * why beyond "rejected".
 *
 * Unconfigured and a bad signature both refuse with the exact same 401, in
 * the standard envelope every other guarded route uses (the same choice the
 * email webhook makes), so neither is distinguishable from outside.
 */
export async function handleBillingWebhook(
  request: Request,
  deps: { provider: BillingProvider | null; admin: () => SupabaseClient; now?: Date },
): Promise<Response> {
  if (!deps.provider?.live) return unauthenticated();

  const rawBody = await request.text();
  let event;
  try {
    event = await deps.provider.readWebhook(rawBody, request.headers, deps.now);
  } catch (thrown) {
    if (thrown instanceof WebhookSignatureError) {
      log.warn("billing webhook rejected", { provider: deps.provider.name });
      return unauthenticated();
    }
    // Unparseable after a valid signature: the provider's problem to resend.
    log.warn("billing webhook unreadable", { provider: deps.provider.name, reason: thrown instanceof Error ? thrown.name : "unknown" });
    return json(400, { error: "unreadable" });
  }

  if (!event) return json(200, { received: true, acted: false });

  const result = await recordBillingEvent(deps.admin(), deps.provider.name, event);
  if (!result.recorded && !result.duplicate) {
    // A refund for a payment we never recorded: nothing to tie it to.
    log.warn("billing webhook unmatched", { provider: deps.provider.name, type: event.type });
    return json(200, { received: true, acted: false });
  }
  return json(200, { received: true, acted: result.recorded && result.applied, duplicate: !result.recorded });
}

function unauthenticated(): Response {
  return new Response(
    JSON.stringify({ error: { code: "unauthenticated", message: "Authentication required.", requestId: "billing-webhook" } }),
    { status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
