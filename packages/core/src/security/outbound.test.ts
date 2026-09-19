import { describe, expect, it } from "vitest";

import {
  MAX_REDIRECTS,
  checkOutbound,
  checkRedirect,
  isPrivateAddress,
  type OutboundPolicy,
} from "./outbound";

/**
 * The SSRF guard (story 15-008).
 *
 * Every case here is an address a server sitting inside a private network,
 * holding cloud credentials, must refuse to fetch on somebody else's say-so.
 * The metadata endpoints are the ones that turn a nuisance into a compromised
 * deployment, so they are named individually rather than left to a range.
 */

const policy: OutboundPolicy = { allowedHosts: ["portal.school.example", ".calendar.example"] };
const open: OutboundPolicy = { allowedHosts: [".example", "169.254.169.254", "127.0.0.1", "[::1]"] };

describe("addresses that are never a provider", () => {
  it("refuses the cloud metadata endpoint, by address and by name", () => {
    // The single most valuable target: it hands over the machine's identity.
    expect(checkOutbound("https://169.254.169.254/latest/meta-data/", open)).toMatchObject({
      ok: false,
      code: "private_address",
    });
    expect(checkOutbound("https://metadata.google.internal/computeMetadata/v1/", open)).toMatchObject({
      ok: false,
      code: "private_address",
    });
  });

  it("refuses loopback, however it is spelled", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]", "127.1.1.1"]) {
      expect(checkOutbound(`https://${host}/`, open), host).toMatchObject({ ok: false });
    }
  });

  it("refuses every private range", () => {
    for (const host of ["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.1", "100.64.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(host), host).toBe(true);
    }
  });

  it("does not mistake a public address for a private one", () => {
    for (const host of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "192.167.1.1", "100.128.0.1"]) {
      expect(isPrivateAddress(host), host).toBe(false);
    }
  });

  it("sees through IPv6 forms that carry an IPv4 address", () => {
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("refuses a malformed address rather than guessing", () => {
    expect(isPrivateAddress("999.999.999.999")).toBe(false);
    expect(checkOutbound("not a url at all", open)).toMatchObject({ ok: false, code: "not_a_url" });
  });
});

describe("the shape of the request", () => {
  it("refuses anything that is not https", () => {
    for (const url of ["http://portal.school.example/", "file:///etc/passwd", "gopher://x.example/"]) {
      expect(checkOutbound(url, policy), url).toMatchObject({ ok: false, code: "scheme_not_allowed" });
    }
  });

  it("refuses credentials in the address", () => {
    // Both a credential in every log line and the oldest trick for making one
    // host look like another.
    expect(checkOutbound("https://portal.school.example@evil.example/", policy)).toMatchObject({
      ok: false,
    });
    expect(checkOutbound("https://user:pass@portal.school.example/", policy)).toMatchObject({
      ok: false,
      code: "credentials_in_url",
    });
  });

  it("refuses a port no provider is served on", () => {
    // An https URL on 6379 is somebody reaching a Redis this server can see.
    expect(checkOutbound("https://portal.school.example:6379/", policy)).toMatchObject({
      ok: false,
      code: "port_not_allowed",
    });
    expect(checkOutbound("https://portal.school.example:443/", policy)).toMatchObject({ ok: true });
  });
});

describe("the allowlist", () => {
  it("allows exactly what it names", () => {
    expect(checkOutbound("https://portal.school.example/items", policy)).toMatchObject({ ok: true });
  });

  it("refuses anything it does not", () => {
    expect(checkOutbound("https://evil.example/", policy)).toMatchObject({
      ok: false,
      code: "host_not_allowed",
    });
  });

  it("matches subdomains only where a dot says so", () => {
    expect(checkOutbound("https://feeds.calendar.example/x", policy)).toMatchObject({ ok: true });
    expect(checkOutbound("https://sub.portal.school.example/x", policy)).toMatchObject({ ok: false });
  });

  it("does not let a lookalike host through", () => {
    // "portal.school.example.evil.com" ends with neither entry.
    expect(checkOutbound("https://portal.school.example.evil.com/", policy)).toMatchObject({
      ok: false,
      code: "host_not_allowed",
    });
  });

  it("is checked before the private-address rules", () => {
    // A household must not learn "that address is private" about a host that
    // was never permitted in the first place.
    expect(checkOutbound("https://10.0.0.1/", policy)).toMatchObject({ code: "host_not_allowed" });
  });

  it("still refuses a private literal that somebody allowlisted", () => {
    expect(checkOutbound("https://169.254.169.254/", open)).toMatchObject({ code: "private_address" });
  });
});

describe("redirects", () => {
  const from = new URL("https://portal.school.example/start");

  it("checks every hop, not just the first", () => {
    // A provider answering 302 to the metadata endpoint has asked us to fetch
    // it on their behalf. A client that validates only the first URL obliges.
    expect(checkRedirect("https://169.254.169.254/", from, open)).toMatchObject({ ok: false });
    expect(checkRedirect("http://portal.school.example/x", from, policy)).toMatchObject({
      ok: false,
      code: "scheme_not_allowed",
    });
  });

  it("resolves a relative location before judging it", () => {
    expect(checkRedirect("/next", from, policy)).toMatchObject({ ok: true });
    // Protocol-relative: looks relative, changes host.
    expect(checkRedirect("//evil.example/x", from, policy)).toMatchObject({
      ok: false,
      code: "host_not_allowed",
    });
  });

  it("stops a chain before it becomes a loop somebody built", () => {
    expect(MAX_REDIRECTS).toBeGreaterThan(0);
    expect(MAX_REDIRECTS).toBeLessThanOrEqual(5);
  });
});
