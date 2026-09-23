import { createAdminClient } from "@wonderhome/core/db/admin";
import { resolveHouseholdIdByAddress } from "@wonderhome/core/homesend/addresses";
import {
  fetchReceivedEmail,
  parseEmailReceivedEvent,
  platformResendConfig,
  verifySvixSignature,
} from "@wonderhome/core/homesend/email-gateway";
import { understand } from "@wonderhome/core/homesend/ingest";
import { contentHash, htmlToText, normalizeText } from "@wonderhome/core/homesend/normalize";
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
 * server-side, via `resolveHouseholdIdByAddress` — never accepted from the
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
  const candidates = [...event.data.to, ...event.data.received_for];
  let householdId: string | null = null;
  for (const candidate of candidates) {
    householdId = await resolveHouseholdIdByAddress(supabase, candidate);
    if (householdId) break;
  }
  if (!householdId) {
    // No household recognizes this address — never confirm or deny which
    // addresses are real to an unauthenticated sender; just ack and stop.
    return new Response(null, { status: 200 });
  }

  const email = await fetchReceivedEmail(event.data.email_id, config.apiKey);
  if (!email) {
    // Could not retrieve the message content — a non-2xx tells Resend to
    // retry, per the architecture doc's "persistence/fetch failure -> retry".
    return new Response(JSON.stringify({ error: { code: "upstream_fetch_failed", message: "Could not retrieve the email." } }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  // The plain-text part when there is one; otherwise the HTML part, reduced
  // to text first — never handed to a model as markup (Wave 3 §6).
  const body = email.text?.trim() ? normalizeText(email.text) : email.html ? htmlToText(email.html).text : "";
  if (!body) {
    // Nothing readable at all — ack rather than retry forever on a message
    // that will never have text.
    return new Response(null, { status: 200 });
  }

  const { item, duplicate } = await createEmailHomeSendItem(supabase, {
    householdId,
    externalId: email.id,
    senderAddress: email.from,
    rawText: body,
    subject: email.subject?.trim().slice(0, 300) || null,
    contentHash: await contentHash(body),
  });
  if (duplicate) {
    return new Response(null, { status: 200 });
  }

  try {
    // The same understanding step every other HomeSend input ends in. The
    // sender and subject are evidence, told to the model as untrusted
    // context — never proof of which household member sent it.
    await understand(supabase, householdId, item.id, {
      source: { text: body },
      channel: "email",
      context: { channel: "a forwarded email", subject: email.subject ?? null, from: email.from },
      text: body,
    });
  } catch (thrown) {
    // Understanding is a convenience, not the point of this request — the
    // item is already safely persisted and still reachable for manual entry.
    log.warn("homesend email webhook: understanding failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }

  return new Response(null, { status: 200 });
}

export const dynamic = "force-dynamic";
