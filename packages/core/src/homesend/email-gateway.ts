import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * The inbound-email side of HomeSend Phase 2, behind a provider-neutral
 * seam. Resend is the one implementation (per CLAUDE.md's external-providers
 * rule: a provider is live only once real credentials, DNS and contract
 * tests exist — `platformResendConfig` returning `null` is what "not
 * configured" looks like end to end, exactly the pattern `voice/platform-key.ts`
 * and `ai/model-key.ts` already use for their own providers).
 *
 * Two real network facts drove this shape (confirmed against Resend's
 * current docs, not assumed):
 *  1. The `email.received` webhook carries only an id and routing metadata —
 *     "webhooks do not include the email body, headers, or attachments".
 *     Reading the actual message needs a second call, `fetchReceivedEmail`.
 *  2. Signatures are Svix-format: `svix-id` / `svix-timestamp` /
 *     `svix-signature` headers, HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`,
 *     keyed on the webhook secret (optionally `whsec_`-prefixed, base64 after
 *     that). Verified over the exact raw bytes — never a re-parsed/
 *     re-stringified body, which is why the webhook route reads
 *     `request.text()` first and only JSON-parses after this check passes.
 */

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function platformResendConfig(
  env: Record<string, string | undefined> = process.env,
): { apiKey: string; webhookSecret: string } | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const webhookSecret = env.RESEND_WEBHOOK_SECRET?.trim();
  return apiKey && webhookSecret ? { apiKey, webhookSecret } : null;
}

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

/**
 * Verifies a Svix-format webhook signature over the exact raw body.
 * `now` is injectable so a fixture can construct a valid signature at a
 * fixed instant without racing the clock in tests.
 */
export function verifySvixSignature(
  input: { headers: SvixHeaders; rawBody: string; secret: string },
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(now.getTime() / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const secretBase64 = input.secret.startsWith("whsec_") ? input.secret.slice("whsec_".length) : input.secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretBase64, "base64");
  } catch {
    return false;
  }
  if (secretBytes.length === 0) return false;

  const signedContent = `${id}.${timestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBytes = Buffer.from(expected, "utf8");

  // svix-signature carries one or more space-separated "v1,<base64>" entries.
  return signature.split(" ").some((entry) => {
    const [version, candidate] = entry.split(",");
    if (version !== "v1" || !candidate) return false;
    const candidateBytes = Buffer.from(candidate, "utf8");
    return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
  });
}

const EmailReceivedEventSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    to: z.array(z.string()).default([]),
    received_for: z.array(z.string()).default([]),
  }),
});

export type EmailReceivedEvent = z.infer<typeof EmailReceivedEventSchema>;

/** Parses the webhook envelope. Any shape mismatch returns `null` — never throws, never guesses. */
export function parseEmailReceivedEvent(rawBody: string): EmailReceivedEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = EmailReceivedEventSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

const ReceivedEmailSchema = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string().nullable().optional(),
  text: z.string().nullable().optional().default(null),
  html: z.string().nullable().optional().default(null),
});

export type ReceivedEmail = z.infer<typeof ReceivedEmailSchema>;

/**
 * The second call: fetches the email's actual content by id. Real Resend
 * behavior only when `platformResendConfig()` is non-null; `fetchImpl` is
 * injectable so tests exercise this without a real network call. Never
 * throws — a network failure, a non-2xx, or an unexpected body shape all
 * resolve to `null`, so the caller can leave the webhook retryable rather
 * than pretending it read something it did not.
 */
export async function fetchReceivedEmail(
  emailId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReceivedEmail | null> {
  try {
    const response = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    const parsed = ReceivedEmailSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
