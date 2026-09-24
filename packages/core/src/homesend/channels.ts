import type { HomeSendSource } from "./items";

/**
 * The HomeSend inbox's "All | WhatsApp | Email | Uploads" filter (story
 * 14-016). Every source belongs to exactly one group, so an item is never
 * missing from its tab and never shown under two.
 */

export const INBOX_CHANNELS = ["all", "whatsapp", "email", "uploads"] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

const GROUP: Record<HomeSendSource, Exclude<InboxChannel, "all">> = {
  whatsapp: "whatsapp",
  whatsapp_media: "whatsapp",
  email: "email",
  email_attachment: "email",
  manual_upload: "uploads",
  pasted_text: "uploads",
  link: "uploads",
  audio_note: "uploads",
};

export function channelOf(source: HomeSendSource): Exclude<InboxChannel, "all"> {
  return GROUP[source];
}

/** Anything not a known tab reads as "all", so a stale or hand-typed link still shows the inbox. */
export function readInboxChannel(value: string | string[] | undefined): InboxChannel {
  const raw = Array.isArray(value) ? value[0] : value;
  return (INBOX_CHANNELS as readonly string[]).includes(raw ?? "") ? (raw as InboxChannel) : "all";
}

export function inChannel<T extends { source: HomeSendSource }>(items: T[], channel: InboxChannel): T[] {
  return channel === "all" ? items : items.filter((item) => channelOf(item.source) === channel);
}

export type InboxSegment = { key: InboxChannel; label: string; href: string; count: number };

const LABEL: Record<InboxChannel, string> = { all: "All", whatsapp: "WhatsApp", email: "Email", uploads: "Uploads" };

/**
 * The tabs worth showing. A channel appears when it is available to this
 * household or already has items in it — a WhatsApp tab before WhatsApp is
 * set up would only ever be empty. With nothing but uploads there is nothing
 * to filter, so no tabs at all. Counts are what is waiting on a person.
 */
export function inboxSegments(
  items: { source: HomeSendSource; waiting: boolean }[],
  available: { whatsapp: boolean; email: boolean },
  basePath = "/home-send",
): InboxSegment[] {
  const present = new Set(items.map((item) => channelOf(item.source)));
  const shown: InboxChannel[] = ["all"];
  if (available.whatsapp || present.has("whatsapp")) shown.push("whatsapp");
  if (available.email || present.has("email")) shown.push("email");
  shown.push("uploads");
  if (shown.length <= 2) return [];
  return shown.map((key) => ({
    key,
    label: LABEL[key],
    href: key === "all" ? basePath : `${basePath}?channel=${key}`,
    count: inChannel(items, key).filter((item) => item.waiting).length,
  }));
}
