import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { hitRateLimit } from "../security/rate-limit";
import { resolveRecipientHouseholds } from "./addresses";
import { recordEmailEvents, type EmailEvent } from "./email-monitoring";
import { fetchReceivedAttachment, fetchReceivedEmail, parseEmailReceivedEvent, toEmailSource, verifySvixSignature } from "./email-gateway";
import { ingestEmailAttachment, understand, type IngestDeps } from "./ingest";
import { contentHash, htmlToText, MAX_BYTES, normalizeText } from "./normalize";
import { createEmailHomeSendItem } from "./repository";
import { drainJobs, enqueueClassifyRetry } from "./retry-queue";

/**
 * The email intake channel's front door (HomeSend Phase 2), as one function
 * the route calls with its real collaborators and a test calls with stand-ins
 * — so what is tested is the delivery path itself: signature, parsing,
 * recipient routing, fetch, persistence, understanding, attachments and the
 * closed-word events, in the order a real delivery takes them (HS-006,
 * HS-008, HS-009).
 *
 * Provider-authenticated, not household-authenticated — there is no
 * Supabase session on a webhook request. The household is resolved from the
 * recipient address, server-side, via `resolveRecipientHouseholds` — never
 * accepted from the payload itself.
 *
 * Unconfigured and a bad signature both refuse with the exact same 401
 * envelope every other endpoint gives an anonymous caller: never say which
 * part was wrong, and never say whether a secret is configured at all.
 */

/**
 * The largest body this endpoint reads (Wave 5 §15). Resend's
 * `email.received` event is metadata; the message itself is fetched
 * separately, so a genuine delivery is a few kilobytes. Anything far larger
 * is refused before its signature is checked or it is parsed.
 */
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export type EmailWebhookDeps = {
  /** Resend's key and signing secret; null when this deployment has none, which refuses everything. */
  config: { apiKey: string; webhookSecret: string } | null;
  /** The service-role client: a webhook has no member session. */
  supabase: SupabaseClient;
  fetchEmail?: typeof fetchReceivedEmail;
  fetchAttachment?: typeof fetchReceivedAttachment;
  /** The model and scanner the pipeline uses; the real ones when omitted. */
  ingest?: IngestDeps;
  /** Work to do after the response is sent (Next's `after`). */
  defer: (work: () => Promise<void>) => void;
  /** The clock the signature's freshness is judged by. */
  now?: () => Date;
};

function unauthenticated(): Response {
  return new Response(
    JSON.stringify({ error: { code: "unauthenticated", message: "Authentication required.", requestId: "homesend-email-webhook" } }),
    { status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function handleEmailWebhook(request: Request, deps: EmailWebhookDeps): Promise<Response> {
  const config = deps.config;
  if (!config) return unauthenticated();

  const startedAt = Date.now();
  const supabase = deps.supabase;
  const fetchEmail = deps.fetchEmail ?? fetchReceivedEmail;
  const fetchAttachment = deps.fetchAttachment ?? fetchReceivedAttachment;
  // What happened to this delivery, in closed words (Wave 5 §14). Recorded
  // on every way out, never including anything from the email itself.
  const events: EmailEvent[] = [];
  const finish = async (response: Response): Promise<Response> => {
    await recordEmailEvents(supabase, events);
    return response;
  };

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BODY_BYTES) return new Response(null, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) return new Response(null, { status: 413 });
  const verified = verifySvixSignature({
    headers: {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    rawBody,
    secret: config.webhookSecret,
  }, deps.now?.());
  if (!verified) {
    events.push({ kind: "signature_failed" });
    return finish(unauthenticated());
  }

  const event = parseEmailReceivedEvent(rawBody);
  if (!event) {
    // A malformed body from a source that just proved it holds the real
    // secret is still not this endpoint's to guess at — ack so Resend does
    // not retry a payload that will never parse differently.
    return new Response(null, { status: 200 });
  }
  if (event.type !== "email.received") {
    return new Response(null, { status: 200 });
  }

  events.push({ kind: "delivered" });

  // The recipient address is the routing key (§5) — every address the
  // message was delivered to, each resolved server-side. One email sent to
  // two households' addresses is two intakes, one per household; a revoked
  // or unknown address resolves to nothing.
  const households = await resolveRecipientHouseholds(supabase, [...event.data.to, ...event.data.received_for]);
  if (households.length === 0) {
    // No household recognizes this address — never confirm or deny which
    // addresses are real to an unauthenticated sender; just ack and stop.
    events.push({ kind: "unrouted" });
    return finish(new Response(null, { status: 200 }));
  }

  const received = await fetchEmail(event.data.email_id, config.apiKey);
  if (!received) {
    // Could not retrieve the message content — a non-2xx tells Resend to
    // retry, per the architecture doc's "persistence/fetch failure -> retry".
    events.push({ kind: "fetch_failed" });
    return finish(
      new Response(JSON.stringify({ error: { code: "upstream_fetch_failed", message: "Could not retrieve the email." } }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );
  }
  const email = toEmailSource(received);

  // The plain-text part when there is one; otherwise the HTML part, reduced
  // to text first — never handed to a model as markup (Wave 3 §6).
  const body = email.text?.trim() ? normalizeText(email.text) : email.html ? htmlToText(email.html).text : "";
  if (!body && email.attachments.length === 0) {
    // Nothing readable at all — ack rather than retry forever on a message
    // that will never have text.
    return finish(new Response(null, { status: 200 }));
  }

  // Each attachment is fetched once, however many households it is for.
  let retryAttachments = false;
  const attachments: { id: string; bytes: Uint8Array; contentType: string; filename: string | null }[] = [];
  for (const attachment of email.attachments.slice(0, 5)) {
    try {
      const fetched = await fetchAttachment(email.externalId, attachment.id, config.apiKey, MAX_BYTES.document);
      if (fetched.ok) attachments.push({ id: attachment.id, bytes: fetched.bytes, contentType: fetched.contentType, filename: fetched.filename ?? attachment.filename });
      else if (fetched.reason === "unavailable") {
        retryAttachments = true;
        events.push({ kind: "attachment_failed" });
      } else events.push({ kind: "attachment_too_large" });
    } catch (thrown) {
      log.warn("homesend email webhook: attachment fetch failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
      retryAttachments = true;
      events.push({ kind: "attachment_failed" });
    }
  }

  let queuedRetry = false;
  for (const householdId of households) {
    // A household's forwarding address is not a firehose (Wave 5 §15). Past
    // its hourly limit the email is still kept, so nothing is lost, but it
    // is not read by a model and its attachments are not processed until a
    // person looks at it.
    const withinLimit = await hitRateLimit(supabase, "homesend.email", householdId);
    if (!withinLimit) events.push({ kind: "rate_limited", householdId, count: attachments.length });

    const { item, duplicate } = await createEmailHomeSendItem(supabase, {
      householdId,
      externalId: email.externalId,
      senderAddress: email.from,
      rawText: body || `(${email.attachments.length} attachment${email.attachments.length === 1 ? "" : "s"}, no message text)`,
      subject: email.subject?.slice(0, 300) ?? null,
      contentHash: await contentHash(body || email.externalId),
    });

    if (duplicate) events.push({ kind: "duplicate", householdId });

    if (!duplicate && body && withinLimit) {
      let failed = false;
      try {
        // The same understanding step every other HomeSend input ends in.
        // The sender and subject are evidence, told to the model as
        // untrusted context — never proof of which household member sent it.
        const outcome = await understand(supabase, householdId, item.id, {
          source: { text: body },
          channel: "email",
          context: { channel: "a forwarded email", subject: email.subject, from: email.from },
          text: body,
        }, deps.ingest);
        failed = outcome.classifyFailed === true;
      } catch (thrown) {
        // Understanding is a convenience, not the point of this request —
        // the item is already safely persisted and reachable for manual entry.
        log.warn("homesend email webhook: understanding failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
        failed = true;
      }
      if (failed) {
        // Persist first, retry where safe (§16): the item is kept and
        // waiting; a job asks for it to be read again once the provider is back.
        events.push({ kind: "classification_failed", householdId });
        const queued = await enqueueClassifyRetry(supabase, { householdId, itemId: item.id }).catch(() => false);
        if (queued) {
          events.push({ kind: "retry_queued", householdId });
          queuedRetry = true;
        }
      }
    }

    // Every attachment is a HomeSend file of its own (§7), idempotent by
    // its own id, so a retried webhook fetches only what it has not kept
    // yet. A malicious or unreadable one fails safely on its own; the
    // email's text above is already kept either way.
    for (const attachment of withinLimit ? attachments : []) {
      try {
        await ingestEmailAttachment(supabase, {
          householdId,
          parentItemId: item.id,
          externalId: `${email.externalId}:${attachment.id}`,
          bytes: attachment.bytes,
          claimedType: attachment.contentType,
          filename: attachment.filename,
          subject: email.subject,
          sender: email.from,
        }, deps.ingest);
      } catch (thrown) {
        log.warn("homesend email webhook: attachment failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
        retryAttachments = true;
        events.push({ kind: "attachment_failed", householdId });
      }
    }
    events.push({ kind: "processed", householdId, latencyMs: Date.now() - startedAt });
  }

  // Due retries are worked after the response is sent, so a slow provider
  // never holds Resend's delivery open. The daily retention run drains
  // whatever is left.
  if (queuedRetry) {
    deps.defer(async () => {
      await drainJobs(supabase, { limit: 3 }).catch((thrown) =>
        log.warn("homesend retry drain failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] }),
      );
    });
  }

  if (retryAttachments) {
    // The email itself is kept; an attachment that could not be fetched yet
    // is retried by the provider, and everything already kept is skipped.
    return finish(
      new Response(JSON.stringify({ error: { code: "attachment_fetch_failed", message: "Some attachments could not be retrieved yet." } }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );
  }
  return finish(new Response(null, { status: 200 }));
}
