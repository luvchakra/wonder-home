import type { WhatsAppConfig } from "../notifications/whatsapp";

/**
 * Fetching a file someone sent on WhatsApp (the WhatsApp HomeSend spec §14).
 *
 * Two authenticated calls to the Graph API: the media id gives a short-lived
 * URL on Meta's own CDN, and that URL, fetched with the same token, gives the
 * bytes. The URL is never shown to a browser; the bytes go into the private
 * `home-send` bucket like any other HomeSend file, and are only ever read
 * after their type is decided from the bytes themselves.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const MEDIA_TIMEOUT_MS = 15_000;
/** The largest file HomeSend takes in (a voice note, 10MB). */
export const MAX_WHATSAPP_MEDIA_BYTES = 10 * 1024 * 1024;

export type MediaDownload =
  | { ok: true; bytes: Uint8Array; mimeType: string | null }
  | { ok: false; reason: "too_large" | "unavailable" };

/** Meta serves media only from its own hosts; anything else is refused rather than fetched with the token. */
function isMetaMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net|fbcdn\.net)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function downloadWhatsAppMedia(
  config: Pick<WhatsAppConfig, "accessToken">,
  mediaId: string,
  options: { maxBytes?: number; fetch?: typeof fetch } = {},
): Promise<MediaDownload> {
  const fetchImpl = options.fetch ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_WHATSAPP_MEDIA_BYTES;
  const authorization = { authorization: `Bearer ${config.accessToken}` };
  try {
    const described = await fetchImpl(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: authorization, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
    if (!described.ok) return { ok: false, reason: "unavailable" };
    const meta = (await described.json().catch(() => null)) as { url?: unknown; mime_type?: unknown; file_size?: unknown } | null;
    if (typeof meta?.url !== "string" || !isMetaMediaUrl(meta.url)) return { ok: false, reason: "unavailable" };
    if (typeof meta.file_size === "number" && meta.file_size > maxBytes) return { ok: false, reason: "too_large" };

    const file = await fetchImpl(meta.url, { headers: authorization, redirect: "error", signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
    if (!file.ok) return { ok: false, reason: "unavailable" };
    const declared = Number(file.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > maxBytes) return { ok: false, reason: "too_large" };
    if (bytes.length === 0) return { ok: false, reason: "unavailable" };
    return { ok: true, bytes, mimeType: typeof meta.mime_type === "string" ? meta.mime_type : file.headers.get("content-type") };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
