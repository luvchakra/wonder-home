import { sameSite, validatePortalUrl } from "../portals/url-guard";

/**
 * The request/response tester for a REST connection (Connections framework).
 *
 * A REST connection is a base address plus an optional auth header. This makes a
 * single HTTP request to it from the server, so the stored auth header can be
 * attached without ever reaching the browser, and returns the response for an
 * adult to inspect.
 *
 * It is a server-side fetch of a user-supplied address — SSRF territory — so the
 * target is gated exactly like the portal fetcher's scrape URLs: plain https to a
 * real public host (never an IP literal, localhost, link-local or metadata host),
 * and on the **same site** as the connection's base address, so a connection
 * can't be turned into a probe of an unrelated or internal host. As the url-guard
 * notes, the network layer must still re-check the resolved IP at fetch time
 * (DNS can point a valid hostname at a private address); this is the static gate.
 */

export type RestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const REST_METHODS: readonly RestMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export type RestTargetProblem = "invalid_base" | "invalid_url" | "insecure" | "blocked_host" | "offsite";

export type RestTarget = { ok: true; url: string } | { ok: false; reason: RestTargetProblem };

/** Resolve the request address from a connection's base and a path (or full same-site URL), and gate it. */
export function resolveRestTarget(baseUrl: string, path: string): RestTarget {
  const base = validatePortalUrl(baseUrl);
  if (!base.ok) return { ok: false, reason: "invalid_base" };

  const raw = path.trim();
  let target: URL;
  try {
    target = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(raw || "/", base.url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (target.protocol !== "https:") return { ok: false, reason: "insecure" };
  const host = target.hostname.toLowerCase();
  const checkedHost = validatePortalUrl(`https://${host}/`);
  if (!checkedHost.ok) return { ok: false, reason: "blocked_host" };
  if (!sameSite(host, base.host)) return { ok: false, reason: "offsite" };
  target.username = "";
  target.password = "";
  return { ok: true, url: target.toString() };
}

export type RestTestRequest = {
  baseUrl: string;
  authHeader?: string | null;
  authValue?: string | null;
  method: RestMethod;
  path: string;
  headers?: Record<string, string>;
  body?: string | null;
};

export type RestTestResult =
  | { ok: true; status: number; statusText: string; durationMs: number; headers: Record<string, string>; body: string; truncated: boolean }
  | { ok: false; error: string };

const MAX_BODY_CHARS = 16 * 1024;
const TIMEOUT_MS = 15_000;
// A small, safe subset of response headers to show — never echo back request auth.
const SHOWN_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "date",
  "server",
  "cache-control",
  "etag",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
]);

const TARGET_PROBLEM: Record<RestTargetProblem, string> = {
  invalid_base: "This connection has no valid base address. Edit it first.",
  invalid_url: "That isn’t a valid web address.",
  insecure: "The address must start with https://.",
  blocked_host: "That host isn’t allowed.",
  offsite: "That address is on a different site than the connection’s base address.",
};

/** Make one HTTP request to a REST connection's (same-site) target and return the response to inspect. */
export async function testRestRequest(req: RestTestRequest): Promise<RestTestResult> {
  const target = resolveRestTarget(req.baseUrl, req.path);
  if (!target.ok) return { ok: false, error: TARGET_PROBLEM[target.reason] };

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (key.trim()) headers.set(key.trim(), value);
  }
  if (req.authHeader && req.authHeader.trim() && req.authValue) headers.set(req.authHeader.trim(), req.authValue);

  const hasBody = req.body != null && req.body !== "" && req.method !== "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(target.url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    const shown: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (SHOWN_RESPONSE_HEADERS.has(key.toLowerCase())) shown[key] = value;
    });
    const text = await response.text();
    const truncated = text.length > MAX_BODY_CHARS;
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      headers: shown,
      body: truncated ? text.slice(0, MAX_BODY_CHARS) : text,
      truncated,
    };
  } catch (thrown) {
    if (thrown instanceof Error && thrown.name === "AbortError") return { ok: false, error: "The request timed out." };
    return { ok: false, error: "Couldn’t reach that address." };
  } finally {
    clearTimeout(timer);
  }
}
