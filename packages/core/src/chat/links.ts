import { SECONDARY_NAVIGATION } from "../navigation/secondary-navigation";
import { sameSitePath } from "../security/same-site-path";

/**
 * What a chat message may point at (story 12-015, the owner, 2026-10-21:
 * "direct link or tasks can be mentioned in the chat so other member can look
 * at them and take action").
 *
 * A link is one of the household's own records — a bill, a meal, an event, a
 * grocery item, a piece of school work, something at home to look after — or one of WonderHome's screens, picked from a list, never
 * typed (rule 20). The browser sends only the kind and the record's id; the
 * server reads the record through the writer's own session and builds the
 * path and label here, so a link can never name another site or a record the
 * writer cannot see. The database refuses any path that is not on this site.
 */

export const CHAT_RECORD_KINDS = ["bill", "meal", "event", "grocery", "school", "home"] as const;
export type ChatRecordKind = (typeof CHAT_RECORD_KINDS)[number];
export type ChatLinkKind = ChatRecordKind | "page";

export type ChatLink = { kind: ChatLinkKind; path: string; label: string };

/** A record the writer can see, as read on the server. */
export type ChatRecord = { kind: ChatRecordKind; id: string; label: string; onDate?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where each kind of record opens. */
export function recordPath(record: ChatRecord): string | null {
  if (!UUID.test(record.id)) return null;
  switch (record.kind) {
    case "bill":
      return "/bills";
    case "meal":
      return record.onDate && /^\d{4}-\d{2}-\d{2}$/.test(record.onDate) ? `/meals?week=${record.onDate}` : "/meals";
    case "event":
      return `/calendar/events/${record.id}`;
    case "grocery":
      return `/groceries/${record.id}`;
    case "school":
      return "/school?tab=homework";
    case "home":
      return "/household/home";
  }
}

/** A record's link, or null when it cannot be one. Labels are the record's own name, shortened only to the column's limit. */
export function linkForRecord(record: ChatRecord): ChatLink | null {
  const path = recordPath(record);
  const label = record.label.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!path || !label || sameSitePath(path, 300) === null) return null;
  return { kind: record.kind, path, label };
}

/** The screens a message may point at: WonderHome's own areas, by key. */
export const CHAT_PAGE_KEYS = ["groceries", "meals", "bills", "school", "upkeep", "health", "responsibilities", "househelper", "places"] as const;
export type ChatPageKey = (typeof CHAT_PAGE_KEYS)[number];

export function linkForPage(key: string): ChatLink | null {
  if (!(CHAT_PAGE_KEYS as readonly string[]).includes(key)) return null;
  const item = SECONDARY_NAVIGATION.find((entry) => entry.key === key);
  return item ? { kind: "page", path: item.href, label: item.label } : null;
}

/** The screen a stored page link names, so its label is shown in the reader's language. */
export function pageKeyFor(path: string): ChatPageKey | null {
  const item = SECONDARY_NAVIGATION.find((entry) => entry.href === path && (CHAT_PAGE_KEYS as readonly string[]).includes(entry.key));
  return item ? (item.key as ChatPageKey) : null;
}

/** The longest message a person may send (the database's own limit). */
export const CHAT_MESSAGE_MAX = 4000;

/** A message's words as kept: trimmed, never empty, never over the limit. */
export function cleanBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return body.length > 0 && body.length <= CHAT_MESSAGE_MAX ? body : null;
}
