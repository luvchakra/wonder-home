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

const AttachmentMetaSchema = z.object({
  id: z.string().min(1),
  filename: z.string().nullable().optional().default(null),
  content_type: z.string().nullable().optional().default(null),
  size: z.number().nullable().optional().default(null),
});

const ReceivedEmailSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.array(z.string()).optional().default([]),
  cc: z.array(z.string()).nullable().optional().default([]),
  created_at: z.string().nullable().optional().default(null),
  subject: z.string().nullable().optional(),
  text: z.string().nullable().optional().default(null),
  html: z.string().nullable().optional().default(null),
  attachments: z.array(AttachmentMetaSchema).nullable().optional().default([]),
});

export type ReceivedEmail = z.infer<typeof ReceivedEmailSchema>;

/**
 * The internal email contract (Wave 3 §6) — provider-neutral, so nothing
 * past this file knows Resend's field names. The sender is evidence of who
 * forwarded it, never proof of which household member did.
 */
export type EmailSource = {
  externalId: string;
  from: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  receivedAt: string | null;
  text: string | null;
  html: string | null;
  attachmentIds: string[];
  attachments: { id: string; filename: string | null; contentType: string | null; size: number | null }[];
};

export function toEmailSource(email: ReceivedEmail): EmailSource {
  const attachments = (email.attachments ?? []).map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename ?? null,
    contentType: attachment.content_type ?? null,
    size: attachment.size ?? null,
  }));
  return {
    externalId: email.id,
    from: email.from || null,
    to: email.to ?? [],
    cc: email.cc ?? [],
    subject: email.subject?.trim() || null,
    receivedAt: email.created_at ?? null,
    text: email.text ?? null,
    html: email.html ?? null,
    attachmentIds: attachments.map((attachment) => attachment.id),
    attachments,
  };
}

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

const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string().nullable().optional().default(null),
  content_type: z.string().nullable().optional().default(null),
  size: z.number().nullable().optional().default(null),
  download_url: z.string(),
});

/** The one host an attachment's download link may point at — a payload can never redirect this fetch elsewhere. */
function isProviderDownloadUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.hostname === "resend.com" || url.hostname.endsWith(".resend.com"));
  } catch {
    return false;
  }
}

export type FetchedAttachment =
  | { ok: true; filename: string | null; contentType: string; bytes: Uint8Array }
  | { ok: false; reason: "unavailable" | "too_large" };

/**
 * Fetches one attachment of a received email: its metadata (which carries a
 * short-lived signed download link), then its bytes, bounded by `limit`.
 * Never throws; `unavailable` means "try again later" (the webhook answers
 * non-2xx so the provider retries), `too_large` is final.
 */
export async function fetchReceivedAttachment(
  emailId: string,
  attachmentId: string,
  apiKey: string,
  limit: number,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedAttachment> {
  try {
    const response = await fetchImpl(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const parsed = AttachmentSchema.safeParse(await response.json());
    if (!parsed.success || !isProviderDownloadUrl(parsed.data.download_url)) return { ok: false, reason: "unavailable" };
    if (parsed.data.size != null && parsed.data.size > limit) return { ok: false, reason: "too_large" };

    const download = await fetchImpl(parsed.data.download_url);
    if (!download.ok) return { ok: false, reason: "unavailable" };
    const bytes = new Uint8Array(await download.arrayBuffer());
    if (bytes.length > limit) return { ok: false, reason: "too_large" };
    return { ok: true, filename: parsed.data.filename ?? null, contentType: parsed.data.content_type ?? "application/octet-stream", bytes };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
