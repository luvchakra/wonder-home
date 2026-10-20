import { BILL_TYPE_NAMES, billType, billTypeFor, type BillTypeKey } from "../finance/bill-catalog";
import { format as formatMoney, nextDueDate } from "../finance/payments";
import {
  cancelObligation,
  createObligation,
  markObligationPaid,
  setBillPeriodAmount,
  undoBillPayment,
  type PaidBill,
} from "../finance/repository";
import type { HouseholdIntent } from "./intent";
import { linkTo } from "./reply-format";

/**
 * Bills through HomeTalk (backlog 11-010; the owner, 2026-10-20: "align this
 * properly with HomeTalk and HomeBrain so this can be fully controlled by
 * these modules").
 *
 * Three things a person says about a bill, each a real write through the
 * same finance service the Bills screen uses, under the speaker's own
 * session (an Admin's; RLS refuses anyone else):
 * - "add the electricity bill, about 2,400, due on the 5th every month" —
 *   a new bill (`add_bill`), asked once before it is added;
 * - "I paid the electricity bill, 2,340 yesterday" — this month paid, the
 *   bill moved on (`record_bill_payment`), done at once and undoable;
 * - "next month's rent is 26,000" — an amount for this period or the next
 *   (`set_bill_amount`), done at once and undoable.
 *
 * None of it moves money. Paying stays `make_payment`, which waits for a
 * tap and a payment provider.
 */

/** "2,400", "₹2400", "rs 2,400.50", "2.5k", "1 lakh" → 2400 in major units, or null. */
export function amountIn(text: string): number | null {
  const match = text.match(/(?:₹|\brs\.?|\binr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k|thousand|lakh|lac)?\b(?:\s*(?:rupees|rs))?/i);
  if (!match) return null;
  const value = Number(match[1]!.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const scale = match[2] ? (/^k|thousand$/i.test(match[2]) ? 1_000 : 100_000) : 1;
  return Math.round(value * scale * 100) / 100;
}

const AMOUNT = String.raw`(?:₹|\brs\.?|\binr)?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:k|thousand|lakh|lac)?\b(?:\s*(?:rupees|rs))?`;
const PAID_WHEN = String.raw`(?:today|yesterday|day before yesterday|last \w+day|on \w+day|this morning|on (?:the )?\d{1,2}(?:st|nd|rd|th)?(?: of)?(?: \w+)?)`;

/** Whether some words are about a bill: "bill", an EMI, or one of the typical bills by name. */
function billish(words: string): boolean {
  return /\b(bill|emi|premium|fees?)\b/i.test(words) || billTypeFor(words) !== null;
}

/** The bill's own words, without the frame around them: "the electricity bill" → "electricity". */
export function billWords(words: string): string {
  return words
    .toLowerCase()
    .replace(/[,.!?]+/g, " ")
    .replace(/\b(?:the|my|our|a|an|this month'?s|next month'?s|this|monthly|month'?s)\b/g, " ")
    .replace(/\bbills?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Read = Omit<HouseholdIntent, "actorMemberId" | "channel" | "utterance" | "understanding">;

const RECURRENCE: readonly [RegExp, "monthly" | "quarterly" | "yearly"][] = [
  [/\b(?:every month|monthly|each month|a month|per month)\b/i, "monthly"],
  [/\b(?:every quarter|quarterly|every three months|every 3 months)\b/i, "quarterly"],
  [/\b(?:every year|yearly|annually|each year|a year|per year)\b/i, "yearly"],
];

/**
 * Reads a sentence about a bill, or null when it is not one (so "add milk"
 * and "I paid the plumber" go to their own rules). Rules decide; a model's
 * reading arrives with the same named parameters and is grounded the same.
 */
export function readBillUtterance(text: string): Read | null {
  const said = text.trim().replace(/[.!?]+$/, "");

  // "Add the electricity bill, 2,400 due on the 5th every month"
  const add = said.match(/^(?:add|track|set up|start tracking|create|record|note)\s+(?:a |an |the |my |our |new )*(.+)$/i);
  if (add) {
    let rest = add[1]!;
    if (!billish(rest)) return null;
    // A bill being paid ("record that I paid…") is a payment, not a new bill.
    if (/\b(?:paid|settled)\b/i.test(rest)) return null;
    let recurrence: string | undefined;
    for (const [pattern, value] of RECURRENCE) {
      if (pattern.test(rest)) {
        recurrence = value;
        rest = rest.replace(pattern, " ");
      }
    }
    let dueDay: number | undefined;
    const day = rest.match(/\b(?:due|payable|comes|paid)?\s*(?:on|by)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of\s+(?:every|each|the)\s+month)?\b/i);
    if (day && Number(day[1]) >= 1 && Number(day[1]) <= 31) {
      dueDay = Number(day[1]);
      rest = rest.replace(day[0], " ");
    }
    const money = rest.match(new RegExp(String.raw`(?:\b(?:of|for|at|worth|about|around|is|usually)\s+)?${AMOUNT}`, "i"));
    const amount = money ? amountIn(money[0]) : null;
    if (money) rest = rest.replace(money[0], " ");
    const what = billWords(rest.replace(/\b(?:due|payable|every|each)\b/gi, " "));
    if (!what) return null;
    return {
      action: "add_bill",
      target: { kind: "bill", reference: what },
      parameters: { what, ...(amount !== null ? { amount } : {}), ...(dueDay ? { dueDay } : {}), ...(recurrence ? { recurrence } : {}) },
      confidence: 0.88,
    };
  }

  // "I paid the electricity bill, 2,340 yesterday", "mark the rent paid"
  const paid =
    said.match(/^(?:i |we |i've |we've |i have |we have |just )*(?:paid|settled|cleared)\s+(?:off\s+)?(.+)$/i) ??
    said.match(/^mark\s+(.+?)\s+(?:as\s+)?(?:paid|settled|done)(.*)$/i) ??
    said.match(/^(.+?)\s+(?:is|has been|was|got)\s+(?:paid|settled)(.*)$/i);
  if (paid) {
    let rest = `${paid[1]!}${paid[2] ?? ""}`;
    if (!billish(rest)) return null;
    const when = rest.match(new RegExp(String.raw`\b${PAID_WHEN}\b`, "i"));
    if (when) rest = rest.replace(when[0], " ");
    const money = rest.match(new RegExp(String.raw`(?:\b(?:of|for|at|with|as)\s+)?${AMOUNT}`, "i"));
    const amount = money ? amountIn(money[0]) : null;
    if (money) rest = rest.replace(money[0], " ");
    const what = billWords(rest);
    if (!what) return null;
    return {
      action: "record_bill_payment",
      target: { kind: "bill", reference: what },
      parameters: { ...(amount !== null ? { amount } : {}), ...(when ? { when: when[0].toLowerCase().replace(/^on /, "") } : {}) },
      confidence: 0.9,
    };
  }

  // "The electricity bill is 2,340", "next month's rent will be 26,000"
  const amountSaid = said.match(new RegExp(String.raw`^(.+?)\s+(?:is|was|came to|comes to|will be|is going to be|=)\s+(${AMOUNT})(?:\s+(?:this|next) month)?$`, "i"));
  if (amountSaid && billish(amountSaid[1]!)) {
    const amount = amountIn(amountSaid[2]!);
    const what = billWords(amountSaid[1]!);
    if (amount === null || !what) return null;
    return {
      action: "set_bill_amount",
      target: { kind: "bill", reference: what },
      parameters: { amount, period: /\bnext month/i.test(said) ? "next" : "current" },
      confidence: 0.88,
    };
  }
  return null;
}

/** The household's bill a phrase names: one by name or by kind of bill, several (ask), or none. */
export function matchBill<T extends { id: string; name: string; billType?: string | null }>(said: string, bills: readonly T[]): T[] {
  const key = billWords(said);
  if (!key) return [];
  const byName = bills.filter((bill) => billWords(bill.name) === key);
  if (byName.length > 0) return byName;
  const type = billTypeFor(said);
  const byType = type ? bills.filter((bill) => (bill.billType ?? billTypeFor(bill.name)) === type) : [];
  if (byType.length > 0) return byType;
  return bills.filter((bill) => billWords(bill.name).includes(key) || key.includes(billWords(bill.name)));
}

type Context = {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  householdId: string;
  timezone: string;
  now?: Date;
};

type Result = { ok: true; text: string; result: Record<string, unknown> } | { ok: false; reason: string };

const bills = () => linkTo("/bills", "Bills");

function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

/** The next date on or after today that falls on that day of the month (the 31st is the month's last day where shorter). */
export function nextOnDay(today: string, day: number): string {
  const [year, month] = today.split("-").map(Number) as [number, number];
  const on = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const thisMonth = on(year, month);
  return thisMonth >= today ? thisMonth : on(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
}

async function householdCurrency(context: Context): Promise<string> {
  const { data } = await context.supabase.from("households").select("currency").eq("id", context.householdId).maybeSingle();
  return ((data as { currency?: string | null } | null)?.currency ?? "INR").toUpperCase();
}

export async function addBillFromTalk(intent: HouseholdIntent, context: Context): Promise<Result> {
  const what = String(intent.parameters.what ?? intent.target.reference ?? "").trim();
  if (!what) return { ok: false, reason: "Which bill should I add?" };
  const key = billTypeFor(what) as BillTypeKey | null;
  const type = billType(key);
  const name = key ? BILL_TYPE_NAMES[key] : what.charAt(0).toUpperCase() + what.slice(1);
  const recurrence = (["monthly", "quarterly", "yearly"].includes(String(intent.parameters.recurrence)) ? intent.parameters.recurrence : (type?.recurrence ?? "monthly")) as "monthly" | "quarterly" | "yearly" | "one_off";
  const today = todayIn(context.timezone, context.now ?? new Date());
  const day = (intent.parameters.whenResolved as { date?: string } | undefined)?.date;
  const dueOn = day ?? (typeof intent.parameters.dueDay === "number" ? nextOnDay(today, intent.parameters.dueDay) : null);
  const amount = typeof intent.parameters.amount === "number" ? intent.parameters.amount : null;
  const currency = await householdCurrency(context);
  const created = await createObligation(context.supabase, {
    householdId: context.householdId,
    name,
    kind: type?.kind ?? "other",
    amountMinor: amount === null ? null : Math.round(amount * 100),
    currency: amount === null ? null : currency,
    dueOn,
    recurrence,
    billType: key,
  });
  const how = recurrence === "monthly" ? "every month" : recurrence === "quarterly" ? "every three months" : recurrence === "yearly" ? "every year" : "once";
  const due = dueOn ? `, due ${describeDay(dueOn)}` : "";
  const sum = amount !== null ? ` for ${formatMoney(Math.round(amount * 100), currency)}` : "";
  return {
    ok: true,
    text: `Added **${name}**${sum}${due}, ${how}. The coming months are under ${bills()}, ready to fill in.${dueOn ? "" : " Tell me when it's due and I'll keep an eye on it."}`,
    result: { obligationId: created.id, name, dueOn, recurrence },
  };
}

export async function recordBillPaymentFromTalk(intent: HouseholdIntent, context: Context): Promise<Result> {
  const id = typeof intent.parameters.billId === "string" ? intent.parameters.billId : null;
  if (!id) return { ok: false, reason: "Which bill was it?" };
  const name = String(intent.parameters.billLabel ?? intent.target.reference ?? "the bill");
  const today = todayIn(context.timezone, context.now ?? new Date());
  const paidOn = (intent.parameters.whenResolved as { date?: string } | undefined)?.date ?? today;
  if (paidOn > today) return { ok: false, reason: "That day hasn't come yet — say when it was paid." };
  const amount = typeof intent.parameters.amount === "number" ? intent.parameters.amount : null;
  const currency = amount === null ? null : await householdCurrency(context);
  const paid = await markObligationPaid(context.supabase, {
    householdId: context.householdId,
    obligationId: id,
    paidOn,
    amountMinor: amount === null ? null : Math.round(amount * 100),
    currency,
  });
  const sum = amount !== null && currency ? ` — ${formatMoney(Math.round(amount * 100), currency)}` : "";
  const next = paid.nextDueOn ? ` It's next due ${describeDay(paid.nextDueOn)}.` : "";
  const unknown = !paid.recorded ? " I didn't have its amount, so tell me what it came to and I'll keep it in its history." : "";
  return {
    ok: true,
    text: `Marked **${name}** paid ${paidOn === today ? "today" : describeDay(paidOn)}${sum}.${next}${unknown} See ${bills()}.`,
    result: { obligationId: id, name, paid },
  };
}

export async function setBillAmountFromTalk(intent: HouseholdIntent, context: Context): Promise<Result> {
  const id = typeof intent.parameters.billId === "string" ? intent.parameters.billId : null;
  if (!id) return { ok: false, reason: "Which bill is that?" };
  const amount = typeof intent.parameters.amount === "number" ? intent.parameters.amount : null;
  if (amount === null) return { ok: false, reason: "How much is it?" };
  const name = String(intent.parameters.billLabel ?? intent.target.reference ?? "the bill");
  const { data: bill } = await context.supabase.from("obligations").select("due_on, recurrence, amount_minor, currency").eq("id", id).eq("household_id", context.householdId).maybeSingle();
  const row = bill as { due_on: string | null; recurrence: string | null; amount_minor: number | null; currency: string | null } | null;
  if (!row?.due_on) return { ok: false, reason: `**${name}** has no due date yet, so I don't know which month that is. Add one under ${bills()}.` };
  const dueOn = intent.parameters.period === "next" ? nextDueDate(row.due_on, row.recurrence) : row.due_on;
  if (!dueOn) return { ok: false, reason: `**${name}** comes only once, so it has no next month.` };
  const currency = row.currency ?? (await householdCurrency(context));
  const periodLabel = dueOn.slice(0, 7);
  const { data: before } = await context.supabase.from("obligation_periods").select("amount_minor").eq("obligation_id", id).eq("period_label", periodLabel).maybeSingle();
  const previous = intent.parameters.period === "next" ? ((before as { amount_minor?: number } | null)?.amount_minor ?? null) : (row.amount_minor === null ? null : Number(row.amount_minor));
  await setBillPeriodAmount(context.supabase, { householdId: context.householdId, obligationId: id, periodLabel, amountMinor: Math.round(amount * 100), currency });
  return {
    ok: true,
    text: `**${name}** for ${monthOf(dueOn)} is ${formatMoney(Math.round(amount * 100), currency)}, due ${describeDay(dueOn)}. See ${bills()}.`,
    result: { obligationId: id, name, periodLabel, previousMinor: previous, currency },
  };
}

/** Takes back what one of the three wrote, through the same finance service (HomeBrain 4.0 §3.9). */
export async function undoBillTalk(actionType: string, result: Record<string, unknown>, context: Context): Promise<{ ok: true; text: string } | { ok: false; reason: string } | null> {
  const id = typeof result.obligationId === "string" ? result.obligationId : null;
  const name = String(result.name ?? "the bill");
  if (actionType === "add_bill") {
    if (!id) return { ok: false, reason: "I could not find the bill I added, so I left it as it was." };
    await cancelObligation(context.supabase, { id, householdId: context.householdId });
    return { ok: true, text: `Took **${name}** off ${bills()}.` };
  }
  if (actionType === "record_bill_payment") {
    const paid = result.paid as PaidBill | undefined;
    if (!id || !paid?.previous) return { ok: false, reason: "I could not find the payment I noted, so I left it as it was." };
    await undoBillPayment(context.supabase, { householdId: context.householdId, obligationId: id, paid });
    return { ok: true, text: `**${name}** is back to not paid for ${monthOf(`${paid.periodLabel}-01`)}.` };
  }
  if (actionType === "set_bill_amount") {
    if (!id || typeof result.periodLabel !== "string") return { ok: false, reason: "I could not find the amount I noted, so I left it as it was." };
    await setBillPeriodAmount(context.supabase, {
      householdId: context.householdId,
      obligationId: id,
      periodLabel: result.periodLabel,
      amountMinor: typeof result.previousMinor === "number" ? result.previousMinor : null,
      currency: typeof result.currency === "string" ? result.currency : null,
    });
    return { ok: true, text: `Put **${name}**'s amount back as it was.` };
  }
  return null;
}

function describeDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function monthOf(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
