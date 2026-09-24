import type { SupabaseClient } from "@supabase/supabase-js";

import { drainJobs } from "../homesend/retry-queue";
import type { IngestDeps } from "../homesend/ingest";
import { log } from "../observability/logger";
import { recordWhatsAppEvents } from "../whatsapp/events";
import { readInboundMessages } from "../whatsapp/inbound";
import { receiveWhatsAppMessages, WHATSAPP_PROCESS_KIND, whatsappJobHandler } from "../whatsapp/intake";
import {
  isOptOut,
  OPT_OUT_REPLY,
  readWhatsAppWebhook,
  sendWhatsAppText,
  verifyWhatsAppSignature,
  type WhatsAppEnv,
} from "./whatsapp";

/** A delivery of message events is small; anything larger is not one. */
export const MAX_WHATSAPP_WEBHOOK_BYTES = 256 * 1024;

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
 *   - Anything else a linked adult sends (the WhatsApp HomeSend spec) is an
 *     intake: "CONNECT <code>" completes a link, a message from a linked
 *     number is recorded once and queued for HomeSend, and a number with no
 *     link is told how to connect and nothing it sent is kept. Processing
 *     runs after the response (`defer`), and on the job queue if that is cut
 *     short, so WhatsApp gets its 200 quickly.
 * WhatsApp is still not a second brain: nothing here decides, answers
 * questions or touches a domain record. What arrives becomes a HomeSend item,
 * reviewed and confirmed under the same gates as any other.
 */
export async function handleWhatsAppWebhook(
  request: Request,
  deps: {
    config: WhatsAppEnv | null;
    admin: () => SupabaseClient;
    fetch?: typeof fetch;
    /** Runs work after the response has gone (Next's `after`). Without it, processing waits for the job queue. */
    defer?: (work: () => Promise<unknown>) => void;
    ingest?: IngestDeps;
  },
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
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_WHATSAPP_WEBHOOK_BYTES) return json(413, { error: "too_large" });
  const rawBody = await request.text();
  if (rawBody.length > MAX_WHATSAPP_WEBHOOK_BYTES) return json(413, { error: "too_large" });
  if (!(await verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), config.appSecret))) {
    log.warn("whatsapp webhook rejected");
    await recordWhatsAppEvents(deps.admin(), [{ kind: "signature_failed" }]).catch(() => undefined);
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
    await sendWhatsAppText(config.adapter, message.from, OPT_OUT_REPLY, deps.fetch).catch(() => undefined);
  }

  // Intake: everything that isn't a STOP. A failure to record is a 500, so
  // WhatsApp delivers again; recording is idempotent by message id.
  const intakeDeps = { config: config.adapter, fetch: deps.fetch, ingest: deps.ingest };
  const inbound = readInboundMessages(payload).filter((message) => !(message.type === "text" && isOptOut(message.text ?? "")));
  let queued = 0;
  if (inbound.length > 0) {
    try {
      const received = await receiveWhatsAppMessages(admin, inbound, intakeDeps);
      queued = received.queued.length;
    } catch (thrown) {
      log.warn("whatsapp intake failed", { reason: thrown instanceof Error ? thrown.message : "unknown" });
      return json(500, { error: "retry" });
    }
    if (queued > 0 && deps.defer) {
      deps.defer(() =>
        drainJobs(admin, { workerId: "whatsapp-webhook", limit: Math.min(10, queued + 2), deps: deps.ingest, handlers: { [WHATSAPP_PROCESS_KIND]: whatsappJobHandler(intakeDeps) } }).catch((error) =>
          log.warn("whatsapp processing drain failed", { reason: error instanceof Error ? error.message : "unknown" }),
        ),
      );
    }
  }

  return json(200, { received: true, recorded, optedOut, queued });
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
