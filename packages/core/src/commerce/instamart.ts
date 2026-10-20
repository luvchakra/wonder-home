/**
 * Swiggy Instamart as a place to buy the list (the owner, 2026-10-20).
 *
 * Swiggy does not publish an API that any app can sign up for; Instamart
 * ordering is only open through a partner arrangement Swiggy grants. So this
 * is the provider-neutral seam and nothing more, as CLAUDE.md requires of
 * every provider: it is live only once a deployment sets
 * `SWIGGY_INSTAMART_PARTNER_KEY` and `SWIGGY_INSTAMART_API_URL` from a real
 * partner agreement, and until then the cart says it is not connected and
 * never offers a checkout that does nothing.
 *
 * What works today without any agreement is a plain link: Instamart's own
 * search for an item's name, opened in Instamart, where the person buys it
 * themselves. WonderHome sends nothing to Swiggy and learns nothing back.
 */

export type InstamartConfig = { partnerKey: string; apiUrl: string };

/** The partner configuration, or null when this deployment has none (the usual case). */
export function instamartFromEnv(env: Record<string, string | undefined> = process.env): InstamartConfig | null {
  const partnerKey = env.SWIGGY_INSTAMART_PARTNER_KEY?.trim();
  const apiUrl = env.SWIGGY_INSTAMART_API_URL?.trim();
  if (!partnerKey || !apiUrl || !/^https:\/\//.test(apiUrl)) return null;
  return { partnerKey, apiUrl };
}

/** Instamart's own search for a name — a link the person opens, not an integration. */
export function instamartSearchUrl(name: string): string {
  return `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(name.trim().slice(0, 80))}`;
}
