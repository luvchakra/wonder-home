/**
 * The one Graph API version every WhatsApp call uses: sending, typing, media
 * download and Platform admin's "Test WhatsApp". Change it here only.
 *
 * Meta's versions table (https://developers.facebook.com/docs/graph-api/changelog/versions/,
 * read 2026-11-22): v21.0 released 2024-10-02, usable until 2027-01-21; the
 * latest is v27.0 (2026-11-04). After expiry Meta routes a call to the next
 * oldest usable version rather than refusing it (docs/apps/versions), so an
 * expired version changes behaviour silently: upgrade before the date.
 * Meta exposes no header or API that says a version is deprecated, so the
 * date lives here and "Test WhatsApp" warns from it.
 */
export const WHATSAPP_GRAPH_VERSION = "v21.0";
/** Meta's published end of `WHATSAPP_GRAPH_VERSION` (UTC date). */
export const WHATSAPP_GRAPH_VERSION_EXPIRES = "2027-01-21";
/** Meta's newest Graph API version when the date above was checked. */
export const WHATSAPP_GRAPH_LATEST_KNOWN = "v27.0";

export const WHATSAPP_GRAPH = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`;

/** Whole days until the version expires (negative once past). */
export function daysUntilGraphExpiry(now: Date = new Date()): number {
  return Math.floor((Date.parse(`${WHATSAPP_GRAPH_VERSION_EXPIRES}T00:00:00Z`) - now.getTime()) / 86_400_000);
}
