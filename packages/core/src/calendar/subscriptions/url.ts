/**
 * Story 26-022 — normalising a calendar share link before it is stored or
 * fetched.
 *
 * A person pastes whatever their calendar's "share" button gave them. Google
 * and Apple hand out `webcal://` URLs (an unofficial scheme that means "this is
 * a calendar, subscribe to it"); the actual transport is HTTPS. So `webcal://`
 * and `webcals://` become `https://`. Everything else is left to the audited
 * fetcher's own validation (scheme, ports, credentials, private addresses) — we
 * only decide here what string to hand it.
 */

export type NormalisedFeedUrl = { ok: true; url: string } | { ok: false };

/**
 * Turns a pasted share link into the https URL WonderHome will store and fetch,
 * or refuses it as not a web address at all. It does NOT decide whether the URL
 * is safe to fetch — that is the fetcher's job, which resolves and checks every
 * address. It only normalises the scheme and rejects obvious non-URLs.
 */
export function normaliseFeedUrl(raw: string): NormalisedFeedUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false };

  let candidate = trimmed;
  // webcal://host/path and webcals://host/path both mean an HTTPS calendar feed.
  const webcal = /^webcals?:\/\//i.exec(candidate);
  if (webcal) candidate = `https://${candidate.slice(webcal[0].length)}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false };
  }
  // Only https is ever stored. A plaintext feed would carry nothing of ours,
  // but the audited fetcher only speaks https, so normalise http → refuse here
  // rather than store something that can never sync.
  if (url.protocol !== "https:") return { ok: false };
  if (url.username || url.password) return { ok: false };
  return { ok: true, url: url.toString() };
}
