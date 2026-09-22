import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signing WonderHome's own outbound webhook events (story 18-007).
 *
 * `homesend/email-gateway.ts` already verifies a *third party's* signature on
 * an inbound webhook — Svix-format, `t=<timestamp>,v1=<hmac>`. This is the
 * other direction: WonderHome is the one calling out, so it signs its own
 * payload the same way a subscriber's own verification code would expect to
 * find it, using the same primitives (`createHmac`, `timingSafeEqual`,
 * constant-time compare) that verification already trusts.
 *
 * The timestamp is signed alongside the body, not just attached to the
 * header: a receiver that checks `t` is recent *and* included in the HMAC
 * input is protected against a captured signature being replayed against a
 * different body, or an old one being replayed at all.
 */

export type WebhookSignature = {
  /** Unix seconds, signed as part of the payload. */
  timestamp: number;
  /** Base64. */
  signature: string;
};

function signedContent(timestamp: number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/** Signs a raw request body with a webhook subscription's own secret. */
export function signWebhookPayload(secret: string, rawBody: string, timestamp: number = Math.floor(Date.now() / 1000)): WebhookSignature {
  const signature = createHmac("sha256", secret).update(signedContent(timestamp, rawBody)).digest("base64");
  return { timestamp, signature };
}

/** The header value a subscriber sees: `t=<unix>,v1=<base64 hmac>`. */
export function webhookSignatureHeader(sig: WebhookSignature): string {
  return `t=${sig.timestamp},v1=${sig.signature}`;
}

/**
 * Verifies a signature this module produced — used by this module's own
 * round-trip tests, and offered as the reference implementation a
 * subscriber's own verification code can be checked against.
 */
export function verifyWebhookSignature(secret: string, rawBody: string, header: string): boolean {
  const match = /^t=(\d+),v1=([A-Za-z0-9+/=]+)$/.exec(header.trim());
  if (!match) return false;

  const timestamp = Number(match[1]);
  const expected = createHmac("sha256", secret).update(signedContent(timestamp, rawBody)).digest("base64");

  const expectedBytes = Buffer.from(expected, "base64");
  const actualBytes = Buffer.from(match[2]!, "base64");
  if (expectedBytes.length !== actualBytes.length) return false;
  return timingSafeEqual(expectedBytes, actualBytes);
}
