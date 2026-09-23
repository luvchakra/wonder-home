import { describe, expect, it } from "vitest";

import { fetchLinkSafely, isPrivateAddress, MAX_PAGE_BYTES, validateLinkUrl, type ResolvedAddress, type Resolver, type Transport, type TransportResponse } from "./link-fetch";

const encoder = new TextEncoder();

function response(status: number, headers: Record<string, string>, body: string | Uint8Array = ""): TransportResponse {
  const chunk = typeof body === "string" ? encoder.encode(body) : body;
  let aborted = false;
  return {
    status,
    headers,
    body: (async function* () {
      if (!aborted && chunk.length > 0) yield chunk;
    })(),
    abort: () => {
      aborted = true;
    },
  };
}

const publicDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

function recordingTransport(routes: Record<string, () => TransportResponse>): { transport: Transport; calls: { url: string; pinned: ResolvedAddress }[] } {
  const calls: { url: string; pinned: ResolvedAddress }[] = [];
  return {
    calls,
    transport: async (url, pinned) => {
      calls.push({ url: url.toString(), pinned });
      const route = routes[url.toString()];
      if (!route) throw new Error("no route");
      return route();
    },
  };
}

describe("isPrivateAddress (SSRF protection, Wave 3 §3)", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::10.0.0.1", "ff02::1", "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("validateLinkUrl", () => {
  it.each([
    "https://school.example.org/notices/sports-day",
    "http://example.com/a?b=c",
    "https://example.com:443/x",
  ])("accepts %s", (url) => {
    expect(validateLinkUrl(url)).not.toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com/",
    "https://user:pass@example.com/",
    "http://localhost/admin",
    "http://printer.local/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:8080/",
    "https://example.com:8443/",
    "http://[::1]/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://0177.0.0.1/",
    "http://intranet/",
    "not a url",
  ])("refuses %s", (url) => {
    expect(validateLinkUrl(url)).toBeNull();
  });
});

describe("fetchLinkSafely", () => {
  it("reads a public school page into text and never sends anything of the household's", async () => {
    const { transport, calls } = recordingTransport({
      "https://school.example.org/notice": () =>
        response(200, { "content-type": "text/html; charset=utf-8" }, "<title>Notice</title><p>Science Exhibition moved to 29 September.</p>"),
    });
    const result = await fetchLinkSafely("https://school.example.org/notice", { resolve: publicDns, transport });
    expect(result).toEqual({ ok: true, finalUrl: "https://school.example.org/notice", kind: "page", title: "Notice", text: "Notice Science Exhibition moved to 29 September." });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.pinned).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("refuses a hostname that resolves to a private address — DNS is checked, not just the name", async () => {
    const { transport, calls } = recordingTransport({});
    const result = await fetchLinkSafely("https://sneaky.example.com/", { resolve: async () => [{ address: "10.0.0.5", family: 4 }], transport });
    expect(result).toEqual({ ok: false, reason: "blocked_address" });
    expect(calls).toHaveLength(0);
  });

  it("refuses when any one of several resolved addresses is private", async () => {
    const result = await fetchLinkSafely("https://mixed.example.com/", {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "::1", family: 6 }],
      transport: recordingTransport({}).transport,
    });
    expect(result).toEqual({ ok: false, reason: "blocked_address" });
  });

  it("re-checks every redirect hop, and refuses a public page that redirects to metadata", async () => {
    const { transport } = recordingTransport({
      "https://short.example.com/x": () => response(302, { location: "http://169.254.169.254/latest/meta-data/" }),
    });
    expect(await fetchLinkSafely("https://short.example.com/x", { resolve: publicDns, transport })).toEqual({ ok: false, reason: "blocked_address" });
  });

  it("follows a safe redirect", async () => {
    const { transport, calls } = recordingTransport({
      "https://a.example.com/": () => response(301, { location: "/final" }),
      "https://a.example.com/final": () => response(200, { "content-type": "text/plain" }, "Match on Saturday"),
    });
    const result = await fetchLinkSafely("https://a.example.com/", { resolve: publicDns, transport });
    expect(result).toMatchObject({ ok: true, finalUrl: "https://a.example.com/final", text: "Match on Saturday" });
    expect(calls.map((call) => call.url)).toEqual(["https://a.example.com/", "https://a.example.com/final"]);
  });

  it("stops after three redirects", async () => {
    const { transport } = recordingTransport({
      "https://loop.example.com/1": () => response(302, { location: "/2" }),
      "https://loop.example.com/2": () => response(302, { location: "/3" }),
      "https://loop.example.com/3": () => response(302, { location: "/4" }),
      "https://loop.example.com/4": () => response(302, { location: "/5" }),
    });
    expect(await fetchLinkSafely("https://loop.example.com/1", { resolve: publicDns, transport })).toEqual({ ok: false, reason: "too_many_redirects" });
  });

  it("refuses an oversized response, whether declared or streamed", async () => {
    const declared = recordingTransport({ "https://big.example.com/": () => response(200, { "content-type": "text/html", "content-length": String(MAX_PAGE_BYTES + 1) }) });
    expect(await fetchLinkSafely("https://big.example.com/", { resolve: publicDns, transport: declared.transport })).toEqual({ ok: false, reason: "too_large" });

    const streamed = recordingTransport({ "https://big.example.com/": () => response(200, { "content-type": "text/html" }, new Uint8Array(MAX_PAGE_BYTES + 10)) });
    expect(await fetchLinkSafely("https://big.example.com/", { resolve: publicDns, transport: streamed.transport })).toEqual({ ok: false, reason: "too_large" });
  });

  it("reads a linked PDF as a document, and refuses what is neither a page nor a PDF", async () => {
    const pdf = recordingTransport({ "https://s.example.com/f.pdf": () => response(200, { "content-type": "application/pdf" }, "%PDF-1.4 ...") });
    expect(await fetchLinkSafely("https://s.example.com/f.pdf", { resolve: publicDns, transport: pdf.transport })).toMatchObject({ ok: true, kind: "pdf" });

    const zip = recordingTransport({ "https://s.example.com/f.zip": () => response(200, { "content-type": "application/zip" }, "PK") });
    expect(await fetchLinkSafely("https://s.example.com/f.zip", { resolve: publicDns, transport: zip.transport })).toEqual({ ok: false, reason: "unsupported_content" });
  });

  it("names an invalid URL, an unreachable host, an HTTP error and a timeout for what they are", async () => {
    expect(await fetchLinkSafely("not a url")).toEqual({ ok: false, reason: "invalid_url" });
    expect(await fetchLinkSafely("javascript:alert(1)")).toEqual({ ok: false, reason: "invalid_url" });
    // A real address that is not a public page is named for what it is.
    expect(await fetchLinkSafely("http://169.254.169.254/latest/meta-data/")).toEqual({ ok: false, reason: "blocked_address" });
    expect(await fetchLinkSafely("http://localhost:3000/admin")).toEqual({ ok: false, reason: "blocked_address" });
    expect(await fetchLinkSafely("https://gone.example.com/", { resolve: async () => { throw new Error("ENOTFOUND"); } })).toEqual({ ok: false, reason: "unreachable" });

    const error = recordingTransport({ "https://e.example.com/": () => response(500, { "content-type": "text/html" }) });
    expect(await fetchLinkSafely("https://e.example.com/", { resolve: publicDns, transport: error.transport })).toEqual({ ok: false, reason: "http_error" });

    const slow: Transport = (_url, _pinned, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await fetchLinkSafely("https://slow.example.com/", { resolve: publicDns, transport: slow, timeoutMs: 20 })).toEqual({ ok: false, reason: "timeout" });
  });
});
