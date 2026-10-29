import { describe, expect, it } from "vitest";

import type { ResolvedAddress, Resolver, Transport, TransportResponse } from "../../homesend/link-fetch";
import { fetchCalendarFeed, MAX_ICS_BYTES } from "./fetch";
import { normaliseFeedUrl } from "./url";

const encoder = new TextEncoder();
const CALENDAR = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

function response(status: number, headers: Record<string, string>, body = ""): TransportResponse {
  const chunk = encoder.encode(body);
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
const privateDns: Resolver = async () => [{ address: "169.254.169.254", family: 4 }];

function transportOf(route: (url: string) => TransportResponse): Transport {
  return async (url: URL) => route(url.toString());
}

describe("normaliseFeedUrl", () => {
  it("turns webcal into https", () => {
    expect(normaliseFeedUrl("webcal://cal.example.com/f.ics")).toEqual({ ok: true, url: "https://cal.example.com/f.ics" });
    expect(normaliseFeedUrl("WEBCALS://cal.example.com/f.ics")).toEqual({ ok: true, url: "https://cal.example.com/f.ics" });
  });
  it("keeps an https URL", () => {
    expect(normaliseFeedUrl("  https://cal.example.com/f.ics  ")).toEqual({ ok: true, url: "https://cal.example.com/f.ics" });
  });
  it("refuses http, credentials and non-URLs", () => {
    expect(normaliseFeedUrl("http://cal.example.com/f.ics").ok).toBe(false);
    expect(normaliseFeedUrl("https://user:pass@cal.example.com/f.ics").ok).toBe(false);
    expect(normaliseFeedUrl("not a url").ok).toBe(false);
    expect(normaliseFeedUrl("").ok).toBe(false);
  });
});

describe("fetchCalendarFeed", () => {
  const url = "https://cal.example.com/feed.ics";

  it("imports a public text/calendar feed", async () => {
    const result = await fetchCalendarFeed(url, { resolve: publicDns, transport: transportOf(() => response(200, { "content-type": "text/calendar; charset=utf-8" }, CALENDAR)) });
    expect(result).toEqual({ ok: true, finalUrl: url, text: CALENDAR });
  });

  it("accepts a feed served as text/plain if the body is a calendar", async () => {
    const result = await fetchCalendarFeed(url, { resolve: publicDns, transport: transportOf(() => response(200, { "content-type": "text/plain" }, CALENDAR)) });
    expect(result.ok).toBe(true);
  });

  it("refuses a feed whose host resolves to a private address (SSRF)", async () => {
    const result = await fetchCalendarFeed(url, { resolve: privateDns, transport: transportOf(() => response(200, { "content-type": "text/calendar" }, CALENDAR)) });
    expect(result).toEqual({ ok: false, reason: "blocked_address" });
  });

  it("refuses a private-literal URL before any fetch", async () => {
    const result = await fetchCalendarFeed("https://169.254.169.254/latest/meta-data", { resolve: publicDns, transport: transportOf(() => response(200, { "content-type": "text/calendar" }, CALENDAR)) });
    expect(result).toEqual({ ok: false, reason: "blocked_address" });
  });

  it("refuses a web page mislabelled as a feed", async () => {
    const result = await fetchCalendarFeed(url, { resolve: publicDns, transport: transportOf(() => response(200, { "content-type": "text/html" }, "<html></html>")) });
    expect(result).toEqual({ ok: false, reason: "unsupported_content" });
  });

  it("refuses something that is not a calendar", async () => {
    const result = await fetchCalendarFeed(url, { resolve: publicDns, transport: transportOf(() => response(200, { "content-type": "text/plain" }, "just some text")) });
    expect(result).toEqual({ ok: false, reason: "not_calendar" });
  });

  it("refuses an oversized feed by its declared length", async () => {
    const result = await fetchCalendarFeed(url, {
      resolve: publicDns,
      transport: transportOf(() => response(200, { "content-type": "text/calendar", "content-length": String(MAX_ICS_BYTES + 1) }, CALENDAR)),
    });
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });
});
