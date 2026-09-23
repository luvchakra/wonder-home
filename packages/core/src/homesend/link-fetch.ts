import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { htmlToText, isPdf, normalizeText } from "./normalize";

/**
 * Reading a link someone sent (Wave 3 §3), without letting that link reach
 * anything it should not.
 *
 * The threat is server-side request forgery: a URL that points at this
 * server's own network — `localhost`, a cloud metadata address, a private
 * range, a hostname that resolves to one, or a public page that redirects to
 * one. So:
 *
 *  - only `http`/`https`, only the default ports, never a URL carrying
 *    credentials;
 *  - the hostname is resolved first and *every* address it resolves to must
 *    be public, and the connection is then pinned to the address that was
 *    checked, so a second DNS answer (rebinding) cannot swap it;
 *  - redirects are followed by hand, at most three, and each hop is checked
 *    from scratch;
 *  - no cookies, no Authorization, no Referer, nothing of the household's is
 *    ever sent — the request carries only a fixed User-Agent and Accept;
 *  - the body is read up to a size limit and dropped past it, under one
 *    overall time limit.
 *
 * Everything that reaches the network is behind `transport` and `resolve`,
 * so the tests exercise every branch without a network.
 */

export type LinkFailure =
  | "invalid_url"
  | "blocked_address"
  | "unreachable"
  | "too_large"
  | "unsupported_content"
  | "too_many_redirects"
  | "timeout"
  | "http_error";

export type LinkContent =
  | { ok: true; finalUrl: string; kind: "page"; title: string | null; text: string }
  | { ok: true; finalUrl: string; kind: "pdf"; bytes: Uint8Array }
  | { ok: false; reason: LinkFailure };

export const MAX_PAGE_BYTES = 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
export const FETCH_TIMEOUT_MS = 8000;

/** What a household is told for each failure — never which internal check tripped beyond what helps them. */
export const LINK_FAILURE_COPY: Record<LinkFailure, string> = {
  invalid_url: "That doesn't look like a web address WonderHome can open.",
  blocked_address: "WonderHome won't open that address — it isn't a public web page.",
  unreachable: "That page couldn't be reached.",
  too_large: "That page is too large to read.",
  unsupported_content: "That link isn't a web page or PDF WonderHome can read.",
  too_many_redirects: "That link kept redirecting, so WonderHome stopped following it.",
  timeout: "That page took too long to answer.",
  http_error: "That page answered with an error.",
};

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? numbers : null;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a = 0, b = 0, c = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Expands an IPv6 address to eight 16-bit groups, or null when it is not one. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  let tailV4: number[] | null = null;
  const lastColon = text.lastIndexOf(":");
  if (text.includes(".") && lastColon >= 0) {
    tailV4 = ipv4Parts(text.slice(lastColon + 1));
    if (!tailV4) return null;
    text = `${text.slice(0, lastColon + 1)}${((tailV4[0]! << 8) | tailV4[1]!).toString(16)}:${((tailV4[2]! << 8) | tailV4[3]!).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const numbers = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN));
  return numbers.every((group) => Number.isInteger(group)) ? numbers : null;
}

/**
 * Whether an IP address is anything other than an ordinary public address:
 * loopback, private, link-local (which includes cloud metadata at
 * 169.254.169.254), carrier-grade NAT, documentation, multicast, reserved,
 * and IPv6's equivalents — including IPv4 addresses wrapped in IPv6.
 */
export function isPrivateAddress(address: string): boolean {
  const v4 = ipv4Parts(address);
  if (v4) return isPrivateIpv4(v4);

  const groups = ipv6Groups(address);
  if (!groups) return true; // Not an address we can reason about is not an address we connect to.
  const [g0 = 0, g1 = 0, , , , g5 = 0, g6 = 0, g7 = 0] = groups;
  const embeddedV4 = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];

  if (groups.every((group) => group === 0)) return true; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return true; // ::1
  if (groups.slice(0, 5).every((group) => group === 0) && g5 === 0xffff) return isPrivateIpv4(embeddedV4); // ::ffff:a.b.c.d
  if (groups.slice(0, 6).every((group) => group === 0)) return true; // deprecated ::a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b) return isPrivateIpv4(embeddedV4); // NAT64
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x2002) return isPrivateIpv4([g1 >> 8, g1 & 0xff, (groups[2] ?? 0) >> 8, (groups[2] ?? 0) & 0xff]); // 6to4
  return false;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp"];

/** The URL, if it is one HomeSend may try to open at all — before any DNS lookup. */
export function validateLinkUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) return null;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || !host.includes(".") && isIP(host.replace(/^\[|\]$/g, "")) === 0) return null;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  // Numeric forms like 2130706433 or 0x7f.1 that some resolvers treat as addresses.
  if (/^[0-9.]+$/.test(host) && !ipv4Parts(host)) return null;
  if (/^0x[0-9a-f]+/i.test(host) || /(^|\.)0\d/.test(host) && /^[0-9.]+$/.test(host)) return null;
  const literal = host.replace(/^\[|\]$/g, "");
  if (isIP(literal) !== 0 && isPrivateAddress(literal)) return null;
  return url;
}

/** Whether text is at least a well-formed http(s) address — so a refusal can say "not a public page" rather than "not an address". */
function isWebAddress(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) => {
  const found = await dnsLookup(hostname, { all: true, verbatim: true });
  return found.map((entry) => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 }));
};

export type TransportResponse = {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  /** Stops reading; the connection is closed. */
  abort(): void;
};

/** One request to one already-vetted address. The Host header and TLS name stay the URL's own hostname. */
export type Transport = (url: URL, pinned: ResolvedAddress, signal: AbortSignal) => Promise<TransportResponse>;

const REQUEST_HEADERS = {
  "user-agent": "WonderHome-HomeSend/1.0 (+https://wonderhome.app)",
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.8",
  "accept-language": "en",
};

export const nodeTransport: Transport = (url, pinned, signal) =>
  new Promise((resolve, reject) => {
    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = requester(
      url,
      {
        method: "GET",
        headers: REQUEST_HEADERS,
        signal,
        // The connection goes to the address that was checked, never to a
        // fresh DNS answer.
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options && "all" in options && options.all) {
            (callback as unknown as (error: Error | null, addresses: { address: string; family: number }[]) => void)(null, [{ address: pinned.address, family: pinned.family }]);
          } else {
            (callback as unknown as (error: Error | null, address: string, family: number) => void)(null, pinned.address, pinned.family);
          }
        },
      },
      (response: IncomingMessage) => {
        const headers: Record<string, string | undefined> = {};
        for (const [name, value] of Object.entries(response.headers)) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
        resolve({ status: response.statusCode ?? 0, headers, body: response, abort: () => response.destroy() });
      },
    );
    request.on("error", reject);
    request.end();
  });

async function readLimited(response: TransportResponse, limit: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > limit) {
      response.abort();
      return null;
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function charsetOf(contentType: string): string {
  const match = contentType.match(/charset=([^;]+)/i);
  const charset = match?.[1]?.trim().replace(/["']/g, "").toLowerCase() ?? "utf-8";
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return "utf-8";
  }
}

/**
 * Opens a link the way §3 asks: validate, resolve, check every address,
 * pin, fetch with a size and time limit, follow at most three redirects,
 * and hand back readable text (or a PDF's bytes) — never throwing.
 */
export async function fetchLinkSafely(
  raw: string,
  options: { resolve?: Resolver; transport?: Transport; timeoutMs?: number } = {},
): Promise<LinkContent> {
  const resolve = options.resolve ?? systemResolver;
  const transport = options.transport ?? nodeTransport;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);

  try {
    let url = validateLinkUrl(raw);
    if (!url) return { ok: false, reason: isWebAddress(raw) ? "blocked_address" : "invalid_url" };

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const host = url.hostname.replace(/^\[|\]$/g, "");
      let addresses: ResolvedAddress[];
      if (isIP(host) !== 0) {
        addresses = [{ address: host, family: isIP(host) === 6 ? 6 : 4 }];
      } else {
        try {
          addresses = await resolve(host);
        } catch {
          return { ok: false, reason: "unreachable" };
        }
      }
      if (addresses.length === 0) return { ok: false, reason: "unreachable" };
      if (addresses.some((entry) => isPrivateAddress(entry.address))) return { ok: false, reason: "blocked_address" };

      let response: TransportResponse;
      try {
        response = await transport(url, addresses[0]!, controller.signal);
      } catch {
        return { ok: false, reason: controller.signal.aborted ? "timeout" : "unreachable" };
      }

      if (response.status >= 300 && response.status < 400) {
        response.abort();
        const location = response.headers.location;
        if (!location) return { ok: false, reason: "http_error" };
        if (hop === MAX_REDIRECTS) return { ok: false, reason: "too_many_redirects" };
        let next: URL | null;
        try {
          next = validateLinkUrl(new URL(location, url).toString());
        } catch {
          next = null;
        }
        if (!next) return { ok: false, reason: "blocked_address" };
        url = next;
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        response.abort();
        return { ok: false, reason: "http_error" };
      }

      const contentType = (response.headers["content-type"] ?? "").toLowerCase();
      const declaredLength = Number(response.headers["content-length"] ?? "0");
      const isPdfType = contentType.startsWith("application/pdf");
      const isPage = contentType.startsWith("text/html") || contentType.startsWith("application/xhtml+xml") || contentType.startsWith("text/plain");
      if (!isPdfType && !isPage) {
        response.abort();
        return { ok: false, reason: "unsupported_content" };
      }
      const limit = isPdfType ? MAX_PDF_BYTES : MAX_PAGE_BYTES;
      if (declaredLength > limit) {
        response.abort();
        return { ok: false, reason: "too_large" };
      }

      let bytes: Uint8Array | null;
      try {
        bytes = await readLimited(response, limit);
      } catch {
        return { ok: false, reason: controller.signal.aborted ? "timeout" : "unreachable" };
      }
      if (!bytes) return { ok: false, reason: "too_large" };

      if (isPdfType) {
        return isPdf(bytes) ? { ok: true, finalUrl: url.toString(), kind: "pdf", bytes } : { ok: false, reason: "unsupported_content" };
      }
      const decoded = new TextDecoder(charsetOf(contentType)).decode(bytes);
      const page = contentType.startsWith("text/plain") ? { title: null, text: normalizeText(decoded) } : htmlToText(decoded);
      if (!page.text) return { ok: false, reason: "unsupported_content" };
      return { ok: true, finalUrl: url.toString(), kind: "page", title: page.title, text: page.text };
    }
    return { ok: false, reason: "too_many_redirects" };
  } finally {
    clearTimeout(timer);
  }
}
