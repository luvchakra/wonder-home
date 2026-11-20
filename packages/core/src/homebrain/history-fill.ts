import type { HouseholdContextItem } from "../context/types";
import type { HomeSendExtraction, HomeSendKind } from "../homesend/items";
import { HOME_SEND_KINDS } from "../homesend/items";
import { resolveGaps, usable, whyFilled, type GapField, type SenderHistory } from "./memory-resolve";
import { vendorKey, type HouseholdRule } from "./rules";

/**
 * Knowing instead of asking (the owner, 2026-11-20: "as autonomous as
 * possible"). Before HomeSend decides whether an item can be recorded, every
 * gap the household's own records settle is filled, for every kind:
 *
 *   - which kind it is, from what this sender's items were before (`sender_area`);
 *   - a bill's or receipt's payee, from a payee the words name or this sender's earlier bills;
 *   - a bill's category, from the payee's rule or its bills on record;
 *   - a grocery's name, from the household's own words for it ("atta");
 *   - where something happens, from a saved place ("nani's");
 *   - decision 3: a bill missing its amount or day takes the payee's usual
 *     ones — the median of that payee's past bills, the same evidence the
 *     nightly `recurring` check confirms with (two or more) — and is then
 *     always recorded **Checking**. With no history, it stays blank.
 *   - (who a school notice is for is `subject-fill.ts`: class, teacher,
 *     timetable, this sender's notices, else every child at its school, Checking).
 *
 * Pure. Never fills who a health document is for, never anything the content
 * itself said, never an approval; a money value only from the household's
 * own bills and only marked Checking. "Why?" is the evidence, never a model's.
 */

export type HistoryFill = {
  kind: HomeSendKind | null;
  extracted: HomeSendExtraction | null;
  /** One "Why?" line per filled gap, in the household's words. */
  why: string[];
  /** The fields filled. */
  fields: (GapField | "amount" | "date")[];
  /** Something was filled from history that must be checked (an amount, a day, several children): recorded Checking. */
  checking: boolean;
};

export type FillInput = {
  kind: HomeSendKind | null;
  extracted: HomeSendExtraction | null;
  items: readonly HouseholdContextItem[];
  rules: readonly HouseholdRule[];
  sender?: string | null;
  text?: string | null;
  history?: SenderHistory | null;
  /** When it was sent in (an ISO time): a usual day is the next one on or after it. */
  receivedAt: string;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/** The next date with day-of-month `day` on or after `from` (YYYY-MM-DD), the day kept inside short months. */
export function nextOnDay(from: string, day: number): string {
  const [year, month, today] = from.slice(0, 10).split("-").map(Number) as [number, number, number];
  const lastOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  let y = year;
  let m = month;
  if (Math.min(day, lastOf(y, m)) < today) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const d = Math.min(day, lastOf(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** At least this many past bills make a payee's "usual" (as the nightly `recurring` check). */
export const USUAL_AT = 2;

/**
 * A payee's usual amount and day from its bills on record and their paid
 * months. Amounts only when two or more share one currency; a day only from
 * two or more due dates. Null when there is no history to go on.
 */
export function usualBill(payee: string | null | undefined, items: readonly HouseholdContextItem[], receivedAt: string): { amount: { value: number; currency: string; count: number } | null; dueOn: { value: string; count: number } | null; payee: string } | null {
  const key = vendorKey(payee);
  if (!key) return null;
  const bills = items.filter((item) => item.entityType === "bill" && vendorKey(str(item.attributes.payee)) === key && item.attributes.status !== "cancelled");
  if (bills.length === 0) return null;
  const ids = new Set(bills.map((bill) => bill.entityId));
  const payments = items.filter((item) => item.entityType === "bill_payment" && ids.has(item.entityId.split(":")[0] ?? ""));
  const money = [...bills, ...payments]
    .map((item) => ({ minor: typeof item.attributes.amountMinor === "number" ? item.attributes.amountMinor : null, currency: str(item.attributes.currency) }))
    .filter((entry): entry is { minor: number; currency: string } => entry.minor !== null && entry.minor > 0 && entry.currency !== null);
  const currencies = new Set(money.map((entry) => entry.currency));
  const amount = money.length >= USUAL_AT && currencies.size === 1 ? { value: Math.round(median(money.map((entry) => entry.minor))) / 100, currency: money[0]!.currency, count: money.length } : null;
  const days = bills.map((bill) => str(bill.attributes.dueOn)).map((date) => (date && /^\d{4}-\d{2}-\d{2}/.test(date) ? Number(date.slice(8, 10)) : null)).filter((day): day is number => day !== null);
  const dueOn = days.length >= USUAL_AT ? { value: nextOnDay(receivedAt, Math.round(median(days))), count: days.length } : null;
  if (!amount && !dueOn) return null;
  return { amount, dueOn, payee: str(bills[0]!.attributes.payee) ?? payee! };
}

const KINDS: ReadonlySet<string> = new Set(HOME_SEND_KINDS);

/** Every gap the household's memory settles, for every kind. */
export function fillFromHistory(input: FillInput): HistoryFill {
  const memory = { items: input.items, rules: input.rules };
  const base = { sender: input.sender ?? null, text: input.text ?? null, history: input.history ?? null };
  const why: string[] = [];
  const fields: HistoryFill["fields"] = [];
  let kind = input.kind;
  let extracted = input.extracted ? { ...input.extracted } : null;
  let checking = false;

  // Which kind: only when the reading had none, and from what this sender's items were before.
  if ((!kind || kind === "unknown") && extracted?.title) {
    const area = usable(resolveGaps({ ...base, kind: kind ?? "unknown", fields: ["area"] }, memory), "area");
    if (area && KINDS.has(area.value.text) && area.value.text !== "unknown") {
      kind = area.value.text as HomeSendKind;
      why.push(whyFilled(area));
      fields.push("area");
    }
  }
  if (!kind || !extracted) return { kind, extracted, why, fields, checking };

  if (kind === "bill" || kind === "receipt") {
    const named = kind === "bill" ? extracted.payee : extracted.merchant;
    if (!str(named)) {
      const payee = usable(resolveGaps({ ...base, kind, fields: ["payee"] }, memory), "payee");
      if (payee) {
        extracted = kind === "bill" ? { ...extracted, payee: payee.value.text } : { ...extracted, merchant: payee.value.text };
        why.push(whyFilled(payee));
        fields.push("payee");
      }
    }
  }

  if (kind === "bill") {
    if (!str(extracted.billKind) && str(extracted.payee)) {
      const category = usable(resolveGaps({ ...base, kind, fields: ["category"], vendor: extracted.payee }, memory), "category");
      if (category) {
        extracted = { ...extracted, billKind: category.value.text };
        why.push(whyFilled(category));
        fields.push("category");
      }
    }
    // Decision 3: the payee's usual amount and day, marked Checking; blank only with no history.
    const missingAmount = typeof extracted.amount !== "number" || extracted.amount <= 0;
    const missingDay = !str(extracted.dueDate);
    if ((missingAmount || missingDay) && str(extracted.payee)) {
      const usual = usualBill(extracted.payee, input.items, input.receivedAt);
      if (usual && missingAmount && usual.amount) {
        extracted = { ...extracted, amount: usual.amount.value, currency: usual.amount.currency };
        why.push(`The amount is ${usual.payee}'s usual, from its last ${usual.amount.count} bills on record — check it before paying.`);
        fields.push("amount");
        checking = true;
      }
      if (usual && missingDay && usual.dueOn) {
        extracted = { ...extracted, dueDate: usual.dueOn.value };
        why.push(`The due day is ${usual.payee}'s usual, from its last ${usual.dueOn.count} bills on record.`);
        fields.push("date");
        checking = true;
      }
    }
  }

  if (kind === "grocery_item" && str(extracted.title)) {
    const item = usable(resolveGaps({ ...base, kind, fields: ["item"], phrase: extracted.title }, memory), "item");
    if (item && item.value.text.toLowerCase() !== extracted.title!.trim().toLowerCase()) {
      extracted = { ...extracted, title: item.value.text };
      why.push(whyFilled(item));
      fields.push("item");
    }
  }

  if ((kind === "event" || kind === "school_item" || kind === "activity_item") && str(extracted.location)) {
    const place = usable(resolveGaps({ ...base, kind, fields: ["place"], phrase: extracted.location }, memory), "place");
    if (place && place.value.text.toLowerCase() !== extracted.location!.trim().toLowerCase()) {
      extracted = { ...extracted, location: place.value.text };
      why.push(whyFilled(place));
      fields.push("place");
    }
  }

  return { kind, extracted, why, fields, checking };
}
