import { resolveTemporal } from "./temporal";

/**
 * Plain corrections (the owner, 2026-11-14; plan "Nothing stuck in review",
 * phase 2): "No, it's on the 12th", "That's for Kabir, not Meera", "The
 * amount is 1,240", said in HomeTalk or on WhatsApp, fix the most recent
 * matching entry in place, through its governed update, with Undo. A
 * correction confirms the entry (a person just checked it) and is kept as a
 * learning signal (`ai_corrections`, read by HomeBrain's household rules).
 *
 * Pure reading only: which field, and the words for its new value. What it
 * corrects is decided by the caller, newest first, and only among the
 * speaker's own recent entries. WhatsApp stays an input channel: a correction
 * never pays, approves or grants anything.
 */

export type PlainCorrection =
  /** "No, it's on the 12th", "it's Friday", "the date is 12 Nov". */
  | { field: "date"; text: string }
  /** "That's for Kabir, not Meera", "it's for Kabir". */
  | { field: "person"; to: string; from: string | null }
  /** "The amount is 1,240", "it's ₹1,240". */
  | { field: "amount"; text: string };

const LEAD = /^(?:(?:no|nope|sorry|oops|wait|actually)[,.!]?\s+)*/i;

function clean(utterance: string): string {
  return utterance.trim().replace(/[.!]+$/, "").replace(LEAD, "").trim();
}

/** A spoken amount: digits with Indian or Western grouping, an optional currency mark or word. */
const AMOUNT = /^(?:rs\.?\s*|inr\s*|₹\s*|\$\s*|€\s*|£\s*)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?(?:\s*(?:rupees|rs|inr|dollars|euros|pounds))?$/i;

export function readPlainCorrection(utterance: string, context: { timezone: string; now: Date }): PlainCorrection | null {
  const text = clean(utterance);
  if (!text || text.split(/\s+/).length > 12) return null;

  // "The amount is 1,240" / "amount's 1240" / "it's ₹1,240" / "the bill is 1,240".
  const amount = /^(?:the\s+)?(?:amount|total|bill|it)(?:'s|\s+is|\s+was|\s+should\s+be)\s+(.+)$/i.exec(text);
  if (amount && AMOUNT.test(amount[1]!.trim())) return { field: "amount", text: amount[1]!.trim() };

  // "That's for Kabir, not Meera" / "it's for Kabir not Meera" / "for Kabir, not Meera" / "it's for Kabir".
  const forWhom = /^(?:(?:that|this|it)(?:'s|\s+is|\s+was)\s+)?for\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?)(?:\s*,?\s*not\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?))?$/i.exec(text);
  if (forWhom) return { field: "person", to: forWhom[1]!.trim(), from: forWhom[2]?.trim() ?? null };
  // "Kabir, not Meera" said as a correction.
  const swap = /^([A-Z][\w'-]*)\s*,\s*not\s+([A-Z][\w'-]*)$/.exec(text);
  if (swap) return { field: "person", to: swap[1]!, from: swap[2]! };

  // "It's on the 12th" / "it's the 12th" / "the date is 12 Nov" / "on Friday" / "due on the 5th".
  const dated = [
    /^(?:it|that|this)(?:'s|\s+is|\s+was)\s+(?:on\s+)?(.+)$/i,
    /^(?:the\s+)?(?:date|day)(?:'s|\s+is|\s+should\s+be)\s+(.+)$/i,
    /^(?:it's\s+|it\s+is\s+)?due\s+(?:on\s+)?(.+)$/i,
    /^on\s+(.+)$/i,
  ];
  for (const pattern of dated) {
    const said = pattern.exec(text)?.[1]?.trim();
    if (!said) continue;
    const day = withMonth(said, context) ?? said;
    const resolved = resolveTemporal(day, context);
    if (resolved?.date) return { field: "date", text: day };
  }
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "the 12th" names a day of a month without the month: the next 12th from
 * today, on the household's calendar, as "12 Nov" for the date reader.
 */
function withMonth(said: string, context: { timezone: string; now: Date }): string | null {
  const match = /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)$/i.exec(said.trim());
  if (!match) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  const [, month, today] = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(context.now).split("-").map(Number) as [number, number, number];
  const monthIndex = day >= today ? month - 1 : month % 12;
  return `${day} ${MONTHS[monthIndex]}`;
}

/** The words of an amount as a number: "1,240" → 1240; null when it isn't one. */
export function amountOf(text: string): number | null {
  const match = AMOUNT.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1]!.replace(/,/g, ""));
  const fraction = /\.(\d{1,2})/.exec(text);
  const value = whole + (fraction ? Number(`0.${fraction[1]}`) : 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}
