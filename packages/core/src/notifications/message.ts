import { z } from "zod";

import type { Formatter } from "../i18n/format";
import { en } from "../i18n/messages/en";
import type { Translate, TranslationKey } from "../i18n/translate";

/**
 * A reminder as an event and its parameters (story 22-006).
 *
 * A reminder's words are not stored only as finished English. Each one also
 * keeps the key for what it says ("reminder.bill.body") and the values it
 * says it about, typed: a name stays a name, a day is a calendar day, a time
 * is an instant, an amount is an amount in its own currency. Each recipient
 * then reads it in their own language and their own formats. The same
 * rendering in English is what `title`/`body` store, so the stored English
 * and an English reader always agree.
 *
 * What is never translated: a name, an item, a title a person typed. Those
 * are plain strings here and pass through untouched in every language. Only
 * WonderHome's own wording comes from the catalog, never from a model.
 *
 * A row with no message, or one this build cannot read (an unknown key, a
 * malformed value), shows its stored English. A person never sees a key.
 */

export const REMINDER_MESSAGE_VERSION = 1;

export type MessageValue =
  | string
  | number
  | { date: string }
  | { time: string }
  | { money: number; currency: string }
  | { list: string[] }
  | { msg: NotificationMessage };

export type NotificationMessage = { key: ReminderKey; params?: Record<string, MessageValue> };

export type NotificationCopy = { v: typeof REMINDER_MESSAGE_VERSION; title: NotificationMessage; body: NotificationMessage };

/** The catalog keys a reminder may name — WonderHome's own `reminder.*` wording, and nothing else. */
type PluralBase<K> = K extends `${infer Base}#${string}` ? Base : K;
export type ReminderKey = Extract<PluralBase<TranslationKey>, `reminder.${string}`>;

const REMINDER_KEYS = new Set(
  Object.keys(en)
    .filter((key) => key.startsWith("reminder."))
    .map((key) => key.replace(/#\w+$/, "")),
);

export function isReminderKey(key: string): key is ReminderKey {
  return REMINDER_KEYS.has(key);
}

/** Shorthand for building one message. */
export function msg(key: ReminderKey, params?: Record<string, MessageValue>): NotificationMessage {
  return params ? { key, params } : { key };
}

/** A person-typed string, shown as it is in every language. */
export function plain(text: string): NotificationMessage {
  return { key: "reminder.text", params: { text } };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const ValueSchema: z.ZodType<MessageValue> = z.lazy(() =>
  z.union([
    z.string().max(500),
    z.number().finite(),
    z.object({ date: z.string().regex(DAY) }).strict(),
    z.object({ time: z.string().refine((value) => !Number.isNaN(Date.parse(value))) }).strict(),
    z.object({ money: z.number().finite(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
    z.object({ list: z.array(z.string().max(200)).max(50) }).strict(),
    z.object({ msg: MessageSchema }).strict(),
  ]),
);

const MessageSchema: z.ZodType<NotificationMessage> = z.lazy(() =>
  z
    .object({
      key: z.string().refine(isReminderKey),
      params: z.record(z.string().max(40), ValueSchema).optional(),
    })
    .strict(),
) as z.ZodType<NotificationMessage>;

const CopySchema = z.object({ v: z.literal(REMINDER_MESSAGE_VERSION), title: MessageSchema, body: MessageSchema }).strict();

/** The stored message, when this build can read every part of it; otherwise null, and the stored English is shown. */
export function parseCopy(value: unknown): NotificationCopy | null {
  const parsed = CopySchema.safeParse(value);
  return parsed.success ? (parsed.data as NotificationCopy) : null;
}

/** One message in words, in the translator's language and the formatter's conventions. */
export function renderMessage(message: NotificationMessage, t: Translate, format: Formatter): string {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(message.params ?? {})) params[name] = renderValue(value, t, format);
  return t(message.key as TranslationKey, params).trim();
}

function renderValue(value: MessageValue, t: Translate, format: Formatter): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if ("date" in value) return format.date(value.date);
  if ("time" in value) return format.time(value.time);
  if ("money" in value) return format.money(value.money, value.currency);
  if ("list" in value) return format.list(value.list);
  return renderMessage(value.msg, t, format);
}

export function renderCopy(copy: NotificationCopy, t: Translate, format: Formatter): { title: string; body: string } {
  return { title: renderMessage(copy.title, t, format).slice(0, 160), body: renderMessage(copy.body, t, format).slice(0, 500) };
}

/**
 * What one reader sees for a stored reminder: its message in their language
 * when it has one this build can read, and otherwise exactly what was stored.
 */
export function localizeReminder<T extends { title: string; body: string; message?: unknown }>(row: T, t: Translate, format: Formatter): T {
  const copy = parseCopy(row.message);
  if (!copy) return row;
  const words = renderCopy(copy, t, format);
  // A rendering that came out empty (a catalog gap) is never shown over the record.
  return { ...row, title: words.title || row.title, body: words.body || row.body };
}

/** Whether two stored messages say the same thing. Postgres `jsonb` does not keep key order, so keys are compared sorted. */
export function sameCopy(a: unknown, b: unknown): boolean {
  return canonical(a ?? null) === canonical(b ?? null);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
