import type { ChannelAdapter, ChannelError, ChannelNotification, ChannelSendResult } from "./channels";

/**
 * WhatsApp as a delivery channel (story 17-006), through Meta's WhatsApp
 * Cloud API.
 *
 * Code-complete and genuinely inert: it reaches a phone only once a
 * deployment sets `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
 * `WHATSAPP_TEMPLATE_NAME` (an approved message template with two body
 * parameters — the title and the text) and, for the webhook,
 * `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`. A business account,
 * a verified number and an approved template are a person's errand, not
 * something this code can make up, so until then the channel stays the
 * fixture it always was and says so.
 *
 * Business-initiated WhatsApp messages must use an approved template, so
 * every notification goes out as one: the household's words fill its two
 * parameters, and nothing else about a household ever leaves in it.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
export const WHATSAPP_TIMEOUT_MS = 8_000;

type Fetch = typeof fetch;

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateLanguage: string;
  fetch?: Fetch;
};

/** A WhatsApp number as the preference stores it: E.164, "+" and 8–15 digits. */
export function isWhatsAppNumber(target: string | null): target is string {
  return typeof target === "string" && /^\+[1-9]\d{7,14}$/.test(target);
}

export function createWhatsAppAdapter(config: WhatsAppConfig): ChannelAdapter {
  const doFetch = config.fetch ?? fetch;
  return {
    channel: "whatsapp",
    live: true,
    async send(notification: ChannelNotification, target: string | null): Promise<ChannelSendResult> {
      if (!isWhatsAppNumber(target)) return failure("no_target", false, "No WhatsApp number is on file.");
      let response: Response;
      try {
        response = await doFetch(`${GRAPH}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify(templateMessage(notification, target, config)),
          signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
        });
      } catch {
        return failure("unavailable", true, "WhatsApp is not answering right now.");
      }
      if (!response.ok) return errorForResponse(response.status, await response.json().catch(() => null));
      const body = (await response.json().catch(() => null)) as { messages?: { id?: unknown }[] } | null;
      const id = body?.messages?.[0]?.id;
      return typeof id === "string" ? { ok: true, providerMessageId: id } : { ok: true };
    },
  };
}

/** The request body for one notification: a template, with the title and text as its parameters. */
export function templateMessage(notification: ChannelNotification, to: string, config: Pick<WhatsAppConfig, "templateName" | "templateLanguage">) {
  return {
    messaging_product: "whatsapp",
    to: to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [
            // WhatsApp refuses a parameter with a newline or a run of spaces.
            { type: "text", text: oneLine(notification.title, 160) },
            { type: "text", text: oneLine(notification.body, 900) },
          ],
        },
      ],
    },
  };
}

/** A plain reply inside the 24-hour window the person just opened by writing to us. */
export function textMessage(to: string, text: string) {
  return { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: text.slice(0, 1000) } };
}

function oneLine(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max) || "—";
}

function errorForResponse(status: number, body: unknown): ChannelSendResult {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  // 131026: the number is not on WhatsApp, or cannot receive this message.
  if (code === 131026 || code === 131030) return failure("no_target", false, "That number can't receive WhatsApp messages.");
  if (status === 401 || status === 403) return failure("not_configured", false, "WhatsApp refused this deployment's credentials.");
  if (status === 429 || status >= 500) return failure("unavailable", true, "WhatsApp is busy right now; this will be retried.");
  return failure("unavailable", false, "WhatsApp did not accept this message.");
}

function failure(code: ChannelError["code"], retryable: boolean, message: string): ChannelSendResult {
  return { ok: false, error: { code, retryable, message } };
}

/**
 * A free-text reply, allowed only inside the 24-hour window a person opens
 * by writing to WonderHome — which every reply here is. Never used to start
 * a conversation: that is what the approved template is for.
 */
export async function sendWhatsAppText(config: WhatsAppConfig, to: string, text: string, fetchImpl: Fetch = config.fetch ?? fetch): Promise<ChannelSendResult> {
  try {
    const response = await fetchImpl(`${GRAPH}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(textMessage(to, text)),
      signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { messages?: { id?: unknown }[]; error?: { code?: unknown } } | null;
    const id = body?.messages?.[0]?.id;
    if (response.ok && typeof id === "string") return { ok: true, providerMessageId: id };
    return failure("unavailable", response.status === 429 || response.status >= 500, "WhatsApp did not accept this reply.");
  } catch {
    return failure("unavailable", true, "WhatsApp could not be reached.");
  }
}

export type WhatsAppEnv = {
  adapter: WhatsAppConfig;
  appSecret: string | null;
  verifyToken: string | null;
};

/** The deployment's WhatsApp, or none. A half-configured channel is not a channel. */
export function whatsappConfigFromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: Fetch): WhatsAppEnv | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = env.WHATSAPP_TEMPLATE_NAME?.trim();
  if (!accessToken || !phoneNumberId || !templateName) return null;
  return {
    adapter: { accessToken, phoneNumberId, templateName, templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en", fetch: fetchImpl },
    appSecret: env.WHATSAPP_APP_SECRET?.trim() || null,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// The webhook: verification, signatures, and reading what WhatsApp reports.
// ---------------------------------------------------------------------------

/** Meta's `X-Hub-Signature-256: sha256=<hex>` over the raw body, HMAC-SHA256 with the app secret. */
export async function verifyWhatsAppSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index += 1) difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export type WhatsAppStatus = { providerMessageId: string; status: "sent" | "delivered" | "read" | "failed"; errorCode: number | null };
export type WhatsAppInbound = { from: string; text: string; replyTo: string | null };

/** What a delivery told us, in closed words only; anything else in the payload is ignored. */
export function readWhatsAppWebhook(payload: unknown): { statuses: WhatsAppStatus[]; messages: WhatsAppInbound[] } {
  const statuses: WhatsAppStatus[] = [];
  const messages: WhatsAppInbound[] = [];
  const entries = Array.isArray((payload as { entry?: unknown })?.entry) ? ((payload as { entry: unknown[] }).entry) : [];
  for (const entry of entries) {
    const changes = Array.isArray((entry as { changes?: unknown })?.changes) ? (entry as { changes: unknown[] }).changes : [];
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value ?? {};
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const id = (status as { id?: unknown }).id;
        const word = (status as { status?: unknown }).status;
        if (typeof id !== "string" || !["sent", "delivered", "read", "failed"].includes(String(word))) continue;
        const errorCode = (status as { errors?: { code?: unknown }[] }).errors?.[0]?.code;
        statuses.push({ providerMessageId: id, status: word as WhatsAppStatus["status"], errorCode: typeof errorCode === "number" ? errorCode : null });
      }
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const from = (message as { from?: unknown }).from;
        const body = (message as { text?: { body?: unknown }; button?: { text?: unknown } }).text?.body ?? (message as { button?: { text?: unknown } }).button?.text;
        if (typeof from !== "string" || !/^\d{8,15}$/.test(from) || typeof body !== "string") continue;
        const context = (message as { context?: { id?: unknown } }).context?.id;
        messages.push({ from: `+${from}`, text: body.slice(0, 500), replyTo: typeof context === "string" ? context : null });
      }
    }
  }
  return { statuses, messages };
}

/** Whether a reply is someone asking to stop WhatsApp messages — honoured on the spot, as WhatsApp's own policy requires. */
export function isOptOut(text: string): boolean {
  return /^\s*(stop|unsubscribe|stop all|opt out|cancel)\s*[.!]?\s*$/i.test(text);
}

export const OPT_OUT_REPLY = "You won't get WonderHome messages on WhatsApp any more. You can turn them back on in WonderHome's notification settings.";
