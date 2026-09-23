import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import {
  isOptOut,
  OPT_OUT_REPLY,
  readWhatsAppWebhook,
  textMessage,
  verifyWhatsAppSignature,
  type WhatsAppEnv,
} from "./whatsapp";

/**
 * WhatsApp's webhook (story 17-006).
 *
 * Provider-authenticated, never household-authenticated. GET is Meta's
 * one-time handshake: it echoes the challenge only for the deployment's own
 * verify token. POST is believed only after `X-Hub-Signature-256` verifies
 * over the exact raw body. Unconfigured, a wrong token and a bad signature
 * all get the same 401 in the standard envelope, so none is distinguishable
 * from outside.
 *
 * What a delivery can do is deliberately small:
 *   - A delivery report moves a notification's WhatsApp copy along —
 *     `delivered`, `seen` (read) or `delivery_failed` — found by the
 *     provider's message id, recorded in closed words.
 *   - "STOP" switches WhatsApp off for that number on the spot, as WhatsApp's
 *     own policy requires, and says so. Turning it back on is only ever the
 *     member's own act, in the app.
 * Anything else a person writes is not acted on here: WhatsApp is not a
 * second brain, and no domain record is ever touched from this door.
 */
export async function handleWhatsAppWebhook(
  request: Request,
  deps: { config: WhatsAppEnv | null; admin: () => SupabaseClient; fetch?: typeof fetch },
): Promise<Response> {
  const config = deps.config;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (config?.verifyToken && url.searchParams.get("hub.mode") === "subscribe" && token && challenge && constantTimeEqual(token, config.verifyToken)) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return unauthenticated();
  }

  if (!config?.appSecret) return unauthenticated();
  const rawBody = await request.text();
  if (!(await verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), config.appSecret))) {
    log.warn("whatsapp webhook rejected");
    return unauthenticated();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "unreadable" });
  }

  const { statuses, messages } = readWhatsAppWebhook(payload);
  const admin = deps.admin();
  let recorded = 0;
  let optedOut = 0;

  for (const status of statuses) {
    const eventType = status.status === "delivered" ? "delivered" : status.status === "read" ? "seen" : status.status === "failed" ? "delivery_failed" : null;
    if (!eventType) continue;
    const { data: sent } = await admin
      .from("notification_events")
      .select("household_id, notification_id")
      .eq("channel", "whatsapp")
      .eq("event_type", "sent")
      .eq("metadata->>providerMessageId", status.providerMessageId)
      .maybeSingle();
    if (!sent) continue;
    // A report WhatsApp repeats is recorded once.
    const { data: already } = await admin
      .from("notification_events")
      .select("id")
      .eq("channel", "whatsapp")
      .eq("event_type", eventType)
      .eq("metadata->>providerMessageId", status.providerMessageId)
      .limit(1);
    if ((already ?? []).length > 0) continue;
    await admin.from("notification_events").insert({
      household_id: (sent as { household_id: string }).household_id,
      notification_id: (sent as { notification_id: string }).notification_id,
      channel: "whatsapp",
      event_type: eventType,
      metadata: { providerMessageId: status.providerMessageId, ...(status.errorCode !== null ? { code: status.errorCode } : {}) },
    });
    recorded += 1;
  }

  for (const message of messages) {
    if (!isOptOut(message.text)) continue;
    const { data: switchedOff } = await admin
      .from("notification_preferences")
      .update({ enabled: false })
      .eq("channel", "whatsapp")
      .eq("target", message.from)
      .eq("enabled", true)
      .select("member_id");
    if ((switchedOff ?? []).length === 0) continue;
    optedOut += 1;
    await sendText(config, message.from, OPT_OUT_REPLY, deps.fetch).catch(() => undefined);
  }

  return json(200, { received: true, recorded, optedOut });
}

async function sendText(config: WhatsAppEnv, to: string, text: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`https://graph.facebook.com/v21.0/${encodeURIComponent(config.adapter.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.adapter.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(textMessage(to, text)),
    signal: AbortSignal.timeout(8_000),
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function unauthenticated(): Response {
  return new Response(
    JSON.stringify({ error: { code: "unauthenticated", message: "Authentication required.", requestId: "whatsapp-webhook" } }),
    { status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
