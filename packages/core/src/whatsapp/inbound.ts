/**
 * What a person sent WonderHome's WhatsApp number (the WhatsApp HomeSend
 * spec), read from a verified webhook delivery into one closed shape.
 *
 * Only what the pipeline needs is kept: WhatsApp's message id (the
 * idempotency key), who sent it (WhatsApp's id for the number), when, what
 * kind of message it is, its words (a text's body or a file's caption) and,
 * for a file, the media id to fetch it by. Everything else in the payload is
 * ignored. Reactions and system notices are not messages anyone sent us, so
 * they are dropped here.
 */

export const WHATSAPP_MESSAGE_TYPES = ["text", "image", "document", "audio", "video", "unsupported"] as const;
export type WhatsAppMessageType = (typeof WHATSAPP_MESSAGE_TYPES)[number];

export type WhatsAppInboundMessage = {
  /** WhatsApp's message id ("wamid.…"). */
  providerMessageId: string;
  /** WhatsApp's id for the sender: their number in digits. */
  waUserId: string;
  /** The same number in E.164. */
  phone: string;
  /** The sender's WhatsApp profile name, when WhatsApp sent one. Never used to decide anything. */
  profileName: string | null;
  receivedAt: Date;
  type: WhatsAppMessageType;
  /** A text's body, or a file's caption. */
  text: string | null;
  media: { id: string; mimeType: string | null; filename: string | null } | null;
};

/** WhatsApp caps a text at 4096 characters; so does the table. */
export const MAX_WHATSAPP_TEXT = 4096;

const WA_USER_ID = /^[1-9]\d{7,14}$/;

export function readInboundMessages(payload: unknown, now: Date = new Date()): WhatsAppInboundMessage[] {
  const out: WhatsAppInboundMessage[] = [];
  for (const value of changeValues(payload)) {
    const names = new Map<string, string>();
    for (const contact of arrayOf(value.contacts)) {
      const waId = stringOf((contact as { wa_id?: unknown }).wa_id);
      const name = stringOf((contact as { profile?: { name?: unknown } }).profile?.name);
      if (waId && name) names.set(waId, name.trim().slice(0, 120));
    }
    for (const raw of arrayOf(value.messages)) {
      const message = raw as Record<string, unknown>;
      const id = stringOf(message.id);
      const from = stringOf(message.from);
      const kind = stringOf(message.type);
      if (!id || id.length > 200 || !from || !WA_USER_ID.test(from) || !kind) continue;
      if (kind === "reaction" || kind === "system" || kind === "ephemeral" || kind === "request_welcome") continue;

      const seconds = Number(stringOf(message.timestamp));
      const receivedAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : now;
      const base = { providerMessageId: id, waUserId: from, phone: `+${from}`, profileName: names.get(from) ?? null, receivedAt };

      const read = readBody(kind, message);
      if (!read) continue;
      out.push({ ...base, ...read });
    }
  }
  return out;
}

function readBody(kind: string, message: Record<string, unknown>): Pick<WhatsAppInboundMessage, "type" | "text" | "media"> | null {
  switch (kind) {
    case "text": {
      const body = clipped(stringOf((message.text as { body?: unknown } | undefined)?.body));
      return body ? { type: "text", text: body, media: null } : null;
    }
    case "button": {
      const body = clipped(stringOf((message.button as { text?: unknown } | undefined)?.text));
      return body ? { type: "text", text: body, media: null } : null;
    }
    case "interactive": {
      const interactive = message.interactive as { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } } | undefined;
      const body = clipped(stringOf(interactive?.button_reply?.title) ?? stringOf(interactive?.list_reply?.title));
      return body ? { type: "text", text: body, media: null } : null;
    }
    case "image":
    case "document":
    case "audio":
    case "video": {
      const media = message[kind] as { id?: unknown; mime_type?: unknown; filename?: unknown; caption?: unknown } | undefined;
      const mediaId = stringOf(media?.id);
      if (!mediaId || mediaId.length > 200) return { type: "unsupported", text: null, media: null };
      return {
        type: kind,
        text: clipped(stringOf(media?.caption)),
        media: {
          id: mediaId,
          mimeType: stringOf(media?.mime_type)?.slice(0, 120) ?? null,
          filename: stringOf(media?.filename)?.trim().slice(0, 240) || null,
        },
      };
    }
    default:
      // A sticker, a location, a contact card, a poll: kept as "unsupported",
      // so the sender can be told what WonderHome can take.
      return { type: "unsupported", text: null, media: null };
  }
}

function changeValues(payload: unknown): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];
  for (const entry of arrayOf((payload as { entry?: unknown } | null)?.entry)) {
    for (const change of arrayOf((entry as { changes?: unknown } | null)?.changes)) {
      const value = (change as { value?: unknown } | null)?.value;
      if (value && typeof value === "object") values.push(value as Record<string, unknown>);
    }
  }
  return values;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clipped(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_WHATSAPP_TEXT) : null;
}
