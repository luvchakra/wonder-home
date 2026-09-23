import { createAdminClient } from "@wonderhome/core/db/admin";
import { resolveRecipientHouseholds } from "@wonderhome/core/homesend/addresses";
import {
  fetchReceivedAttachment,
  fetchReceivedEmail,
  parseEmailReceivedEvent,
  platformResendConfig,
  toEmailSource,
  verifySvixSignature,
} from "@wonderhome/core/homesend/email-gateway";
import { ingestEmailAttachment, understand } from "@wonderhome/core/homesend/ingest";
import { contentHash, htmlToText, MAX_BYTES, normalizeText } from "@wonderhome/core/homesend/normalize";
import { createEmailHomeSendItem } from "@wonderhome/core/homesend/repository";
import { log } from "@wonderhome/core/observability/logger";

/**
 * The email intake channel's front door (HomeSend Phase 2).
 *
 * Provider-authenticated, not household-authenticated — there is no
 * Supabase session on a webhook request, so this never calls `requireUser`/
 * `requireMembership` and never uses `defineRoute` (which reads the body as
 * JSON before a handler runs; signature verification needs the exact raw
 * bytes first, per Resend's own instruction to verify against the raw
 * request body). The household is resolved from the recipient address,
 * server-side, via `resolveRecipientHouseholds` — never accepted from the
 * payload itself.
 *
 * Real end to end only once a deployment sets `RESEND_API_KEY` and
 * `RESEND_WEBHOOK_SECRET` (a Resend account and a verified receiving domain
 * are a human's errand — DNS records, domain ownership — not something this
 * session can create).
 *
 * Unconfigured and a bad signature both refuse with the exact same 401
 * envelope every other endpoint gives an anonymous caller — the same
 * `platform/retention` route's reasoning: never say which part was wrong,
 * and never say whether a secret is configured at all, since both answers
 * are information a prober would want. This is also what keeps this route
 * consistent with `e2e/domains.spec.ts`'s "every endpoint refuses an
 * anonymous caller the same way" sweep, without needing a special case.
 */
function unauthenticated(): Response {
  return new Response(
    JSON.stringify({ error: { code: "unauthenticated", message: "Authentication required.", requestId: "homesend-email-webhook" } }),
    { status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const config = platformResendConfig();
  if (!config) return unauthenticated();

  const rawBody = await request.text();
  const verified = verifySvixSignature({
    headers: {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    rawBody,
    secret: config.webhookSecret,
  });
  if (!verified) return unauthenticated();

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

  const supabase = createAdminClient();

  // The recipient address is the routing key (§5) — every address the
  // message was delivered to, each resolved server-side. One email sent to
  // two households' addresses is two intakes, one per household; a revoked
  // or unknown address resolves to nothing.
  const households = await resolveRecipientHouseholds(supabase, [...event.data.to, ...event.data.received_for]);
  if (households.length === 0) {
    // No household recognizes this address — never confirm or deny which
    // addresses are real to an unauthenticated sender; just ack and stop.
    return new Response(null, { status: 200 });
  }

  const received = await fetchReceivedEmail(event.data.email_id, config.apiKey);
  if (!received) {
    // Could not retrieve the message content — a non-2xx tells Resend to
    // retry, per the architecture doc's "persistence/fetch failure -> retry".
    return new Response(JSON.stringify({ error: { code: "upstream_fetch_failed", message: "Could not retrieve the email." } }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  const email = toEmailSource(received);

  // The plain-text part when there is one; otherwise the HTML part, reduced
  // to text first — never handed to a model as markup (Wave 3 §6).
  const body = email.text?.trim() ? normalizeText(email.text) : email.html ? htmlToText(email.html).text : "";
  if (!body && email.attachments.length === 0) {
    // Nothing readable at all — ack rather than retry forever on a message
    // that will never have text.
    return new Response(null, { status: 200 });
  }

  // Each attachment is fetched once, however many households it is for.
  let retryAttachments = false;
  const attachments: { id: string; bytes: Uint8Array; contentType: string; filename: string | null }[] = [];
  for (const attachment of email.attachments.slice(0, 5)) {
    try {
      const fetched = await fetchReceivedAttachment(email.externalId, attachment.id, config.apiKey, MAX_BYTES.document);
      if (fetched.ok) attachments.push({ id: attachment.id, bytes: fetched.bytes, contentType: fetched.contentType, filename: fetched.filename ?? attachment.filename });
      else if (fetched.reason === "unavailable") retryAttachments = true;
    } catch (thrown) {
      log.warn("homesend email webhook: attachment fetch failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
      retryAttachments = true;
    }
  }

  for (const householdId of households) {
    const { item, duplicate } = await createEmailHomeSendItem(supabase, {
      householdId,
      externalId: email.externalId,
      senderAddress: email.from,
      rawText: body || `(${email.attachments.length} attachment${email.attachments.length === 1 ? "" : "s"}, no message text)`,
      subject: email.subject?.slice(0, 300) ?? null,
      contentHash: await contentHash(body || email.externalId),
    });

    if (!duplicate && body) {
      try {
        // The same understanding step every other HomeSend input ends in.
        // The sender and subject are evidence, told to the model as
        // untrusted context — never proof of which household member sent it.
        await understand(supabase, householdId, item.id, {
          source: { text: body },
          channel: "email",
          context: { channel: "a forwarded email", subject: email.subject, from: email.from },
          text: body,
        });
      } catch (thrown) {
        // Understanding is a convenience, not the point of this request —
        // the item is already safely persisted and reachable for manual entry.
        log.warn("homesend email webhook: understanding failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
      }
    }

    // Every attachment is a HomeSend file of its own (§7), idempotent by
    // its own id, so a retried webhook fetches only what it has not kept
    // yet. A malicious or unreadable one fails safely on its own; the
    // email's text above is already kept either way.
    for (const attachment of attachments) {
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
        });
      } catch (thrown) {
        log.warn("homesend email webhook: attachment failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
        retryAttachments = true;
      }
    }
  }

  if (retryAttachments) {
    // The email itself is kept; an attachment that could not be fetched yet
    // is retried by the provider, and everything already kept is skipped.
    return new Response(JSON.stringify({ error: { code: "attachment_fetch_failed", message: "Some attachments could not be retrieved yet." } }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(null, { status: 200 });
}

export const dynamic = "force-dynamic";
