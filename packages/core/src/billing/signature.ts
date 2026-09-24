/**
 * Webhook signatures, shared by every payment adapter (stories 20-006, 20-009).
 *
 * A provider's delivery is believed only after an HMAC over the exact raw body
 * verifies against the endpoint secret, compared in constant time. Nothing is
 * parsed before that.
 */

export class WebhookSignatureError extends Error {
  constructor(reason: string) {
    super(`Webhook signature rejected: ${reason}`);
    this.name = "WebhookSignatureError";
  }
}

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
