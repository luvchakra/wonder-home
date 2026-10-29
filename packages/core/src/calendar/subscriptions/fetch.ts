/**
 * Story 26-022 — fetching a calendar feed safely.
 *
 * The URL is somebody else's string, fetched by a server that sits inside a
 * private network and holds cloud credentials. So this reuses the one audited
 * fetch path (`homesend/link-fetch.ts` `fetchRaw`): scheme/credential/port
 * checks, resolve every address and require all public, pin the checked
 * address against DNS rebinding, redirects followed by hand and re-checked, no
 * cookies or Authorization, size- and time-bounded. The only difference from
 * reading a web page is the accepted content type (`text/calendar`) and a
 * sniff that the body really is a calendar.
 */

import { fetchRaw, type LinkFailure, type Resolver, type Transport } from "../../homesend/link-fetch";

/** A calendar feed is small; a 2 MB cap is generous for even a busy year. */
export const MAX_ICS_BYTES = 2 * 1024 * 1024;

export type CalendarFeedFailure = LinkFailure | "not_calendar";

export type CalendarFeedFetch =
  | { ok: true; finalUrl: string; text: string }
  | { ok: false; reason: CalendarFeedFailure };

/** What a household is told for each failure — closed words, never the internal check. */
export const CALENDAR_FEED_FAILURE_COPY: Record<CalendarFeedFailure, string> = {
  invalid_url: "That doesn't look like a calendar address WonderHome can open.",
  blocked_address: "WonderHome won't open that address — it isn't a public calendar feed.",
  unreachable: "That calendar couldn't be reached.",
  too_large: "That calendar is too large to import.",
  unsupported_content: "That link isn't a calendar feed WonderHome can read.",
  too_many_redirects: "That calendar link kept redirecting, so WonderHome stopped following it.",
  timeout: "That calendar took too long to answer.",
  http_error: "That calendar answered with an error.",
  not_calendar: "That link opened, but it isn't an ICS calendar feed.",
};

/**
 * Whether a content type is one a calendar feed is plausibly served with.
 * `text/calendar` is correct; many servers hand an `.ics` back as `text/plain`
 * or `application/octet-stream`, or with no type at all — all guarded by the
 * `BEGIN:VCALENDAR` sniff below, so a mislabelled web page is still refused.
 */
function acceptsCalendar(contentType: string): number | null {
  const type = contentType.split(";")[0]?.trim() ?? "";
  if (type === "text/calendar" || type === "text/plain" || type === "application/octet-stream" || type === "") {
    return MAX_ICS_BYTES;
  }
  return null;
}

/** Decodes the feed bytes. RFC 5545 §3.1.4 fixes the charset at UTF-8. */
function decodeFeed(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

/**
 * Opens a calendar share link safely and hands back its ICS text, or a closed
 * reason. Never throws. `options` inject a resolver/transport so tests drive
 * every branch with no network.
 */
export async function fetchCalendarFeed(
  raw: string,
  options: { resolve?: Resolver; transport?: Transport; timeoutMs?: number } = {},
): Promise<CalendarFeedFetch> {
  const result = await fetchRaw(raw, {
    accept: acceptsCalendar,
    resolve: options.resolve,
    transport: options.transport,
    timeoutMs: options.timeoutMs,
  });
  if (!result.ok) return result;

  const text = decodeFeed(result.bytes);
  // A calendar begins with BEGIN:VCALENDAR; anything else that slipped past the
  // content type (an HTML error page served as text/plain, say) is refused.
  if (!/^\s*BEGIN:VCALENDAR/i.test(text)) return { ok: false, reason: "not_calendar" };
  return { ok: true, finalUrl: result.finalUrl, text };
}
