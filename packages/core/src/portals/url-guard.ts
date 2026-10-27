/**
 * URL safety for the generic portal fetcher (story 08-033).
 *
 * The connector logs into *any* URL a household gives it and then opens the
 * post-auth "scrape" URLs they list. That is a server-side fetch of
 * user-supplied addresses — a classic SSRF foot-gun. So before the worker ever
 * points a browser at one of these, two things are enforced here, with no
 * network and no guessing:
 *
 *  1. A portal and every scrape URL must be plain `https` to a real public
 *     hostname — never an IP literal, never localhost / link-local / cloud
 *     metadata, so a connection can't be turned into a probe of internal
 *     infrastructure.
 *  2. A scrape URL must live on the **same site** as the portal it was captured
 *     from. A household connects one portal; it does not get to make the worker
 *     fetch an unrelated host with a logged-in browser.
 *
 * This is the static gate. The network layer that actually drives the browser
 * must still re-check the *resolved* IP at fetch time (DNS can point a valid
 * hostname at a private address), via the egress proxy / an allowlist — this
 * function cannot see DNS.
 */

export type UrlProblem = "invalid_url" | "insecure" | "blocked_host" | "offsite";

export type PortalUrlResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: Exclude<UrlProblem, "offsite"> };

export type ScrapeUrlResult = { ok: true; url: string; host: string } | { ok: false; reason: UrlProblem };

/** Second-level labels that are really part of the public suffix (so `*.co.in` is not one site). */
const MULTIPART_SLDS = new Set(["co", "com", "net", "org", "ac", "gov", "edu", "gen", "ind", "firm", "res"]);

const METADATA_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

function isIpLiteral(host: string): boolean {
  // IPv6 arrives bracketed from URL.hostname only as the inside; be liberal.
  if (host.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (isIpLiteral(h)) return true; // a portal is a hostname, not a bare IP
  if (METADATA_HOSTS.has(h)) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return true;
  return false;
}

/**
 * The registrable domain, approximately — enough to decide "same site" without a
 * full public-suffix list. For `a.b.looplearning.com` → `looplearning.com`; for
 * `foo.school.co.in` → `school.co.in` (because `co` is a multipart SLD).
 */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last = parts[parts.length - 1] ?? "";
  const sld = parts[parts.length - 2] ?? "";
  const take = last.length === 2 && MULTIPART_SLDS.has(sld) ? 3 : 2;
  return parts.slice(-take).join(".");
}

/** Whether two hosts belong to the same registrable domain (same site). */
export function sameSite(a: string, b: string): boolean {
  const ha = a.toLowerCase().replace(/\.$/, "");
  const hb = b.toLowerCase().replace(/\.$/, "");
  if (ha === hb) return true;
  return baseDomain(ha) === baseDomain(hb) && baseDomain(ha) !== "";
}

function parseHttps(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  return url;
}

/** Validate a portal's login URL: public https hostname only. */
export function validatePortalUrl(raw: string): PortalUrlResult {
  const url = parseHttps(raw);
  if (!url) return { ok: false, reason: "invalid_url" };
  if (url.protocol !== "https:") return { ok: false, reason: "insecure" };
  if (isBlockedHost(url.hostname)) return { ok: false, reason: "blocked_host" };
  // Strip credentials, hash — keep path + query, which a login URL may need.
  url.username = "";
  url.password = "";
  url.hash = "";
  return { ok: true, url: url.toString(), host: url.hostname.toLowerCase() };
}

/**
 * Validate a post-auth scrape URL against the portal it belongs to: public https,
 * and on the same site as the portal. The portal URL must already be valid.
 */
export function validateScrapeUrl(rawScrape: string, portalUrl: string): ScrapeUrlResult {
  const portal = validatePortalUrl(portalUrl);
  if (!portal.ok) return { ok: false, reason: "blocked_host" };
  const url = parseHttps(rawScrape);
  if (!url) return { ok: false, reason: "invalid_url" };
  if (url.protocol !== "https:") return { ok: false, reason: "insecure" };
  if (isBlockedHost(url.hostname)) return { ok: false, reason: "blocked_host" };
  if (!sameSite(url.hostname, portal.host)) return { ok: false, reason: "offsite" };
  url.username = "";
  url.password = "";
  return { ok: true, url: url.toString(), host: url.hostname.toLowerCase() };
}
