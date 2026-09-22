import { isPrivateAddress } from "../security/outbound";

/**
 * Whether a household-supplied webhook target is safe to call.
 *
 * `security/outbound.ts`'s `checkOutbound` is deliberately allowlist-based —
 * built for a fixed set of known providers (a school portal, a calendar
 * feed) a household connects to, each with a real host to name in advance.
 * A webhook target is the opposite shape: any HTTPS host the household
 * chooses, with no fixed list to check it against. So this reuses
 * `outbound.ts`'s private-address judgement (the one part that generalizes —
 * an address is private or it isn't, independent of any allowlist) without
 * its allowlist requirement, checked again at delivery time in `deliver.ts`
 * for the same reason `checkRedirect` re-checks every hop: a hostname that
 * resolves to a public address now and a private one at connect time is a
 * gap no pre-flight check closes on its own.
 */

export type WebhookUrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const DENIED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.goog", "instance-data"]);
const ALLOWED_PORTS = new Set(["", "443", "8443"]);

export function validateWebhookUrl(candidate: string): WebhookUrlCheck {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "That is not a web address." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Webhook endpoints must use https." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "That address has a username or password in it, which WonderHome will not use." };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: "That address points at a port WonderHome does not connect to." };
  }

  const host = url.hostname.toLowerCase();
  if (DENIED_HOSTS.has(host) || isPrivateAddress(host)) {
    return { ok: false, reason: "That address points at a private network, which WonderHome cannot reach." };
  }

  return { ok: true, url };
}
