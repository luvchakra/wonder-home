import { normalizeWords, vendorKey } from "../rules";

/**
 * Payment proof (decision 2, the owner 2026-11-20): a bank, card or UPI
 * message saying the household already paid someone. It arrives the way
 * anything reaches HomeSend (pasted, shared, a WhatsApp forward, a forwarded
 * email, a screenshot) and is read here, deterministically, from the words
 * that were sent or read off the picture. Pure: `payment-apply.ts` writes.
 *
 * It only ever records that the household paid. WonderHome never pays,
 * never follows a link in it, and a message that asks for a payment, an
 * approval, a PIN or a click ("pay now", "approve this collect request",
 * "will be debited") is never proof: it is content, read as anything else
 * (and payment messages are the commonest phishing bait).
 */

export type PaymentMethod = "upi" | "card" | "bank";

export type PaymentProof = {
  /** In major units ("1240.50"). */
  amount: number;
  currency: string;
  /** Who was paid, as the message names them; null when it doesn't. */
  payee: string | null;
  /** The day it was paid ("YYYY-MM-DD"), when the message says. */
  paidOn: string | null;
  method: PaymentMethod;
};

export type PaymentRead =
  | { proof: PaymentProof }
  | { proof: null; reason: "not_payment" | "asks_to_pay" | "credit" | "no_amount" };

/** Words of a request, never of a payment made: phishing bait and bill reminders alike. */
const ASKS_TO_PAY = [
  /\bpay\s+(now|immediately|today|your|the|via|using|at|before)\b/i,
  /\b(kindly|please)\s+(pay|approve|authori[sz]e|confirm|click|verify|update)\b/i,
  /\bclick\b/i,
  /\b(approve|authori[sz]e|accept)\s+(this|the|a)?\s*(payment|request|transaction|mandate|collect)\b/i,
  /\bcollect\s+request\b/i,
  /\b(enter|share)\s+(your\s+)?(upi\s+)?(pin|otp|password|cvv)\b/i,
  /\bwill\s+be\s+(debited|deducted|charged)\b/i,
  /\b(is|are)\s+(due|overdue|pending)\b/i,
  /\b(due\s+(on|by|date)|last\s+date|pay\s+by)\b/i,
  /\brequest(ed|s)?\s+(money|payment|₹|rs\.?|inr)\b/i,
  /\b(account|card|kyc)\s+(will\s+be\s+)?(blocked|suspended)\b/i,
];

/** A payment made, in past tense. */
const DEBIT =
  /\b(debited|deducted|paid|sent|spent|transferred|withdrawn|charged)\b|\bpayment\s+(of|for)\b[^.\n]{0,80}\b(successful|success|completed|done|made|received\s+by)\b|\b(txn|transaction|purchase)\s+(of|for)\b/i;
const CREDIT = /\b(credited|received|refund(ed)?|cashback)\b/i;

const UPI = /\b(upi|vpa|bhim|gpay|google\s+pay|phonepe|paytm)\b|[a-z0-9._-]{2,}@(ok\w+|ybl|ibl|axl|paytm|upi|apl|icici|sbi|hdfcbank|axisbank|\w{2,})\b/i;
const CARD = /\b(credit|debit)\s+card\b|\bcard\s+(ending|no\.?|number|xx|\*)|\bcard\b[^.\n]{0,24}\b(x{2,}|\*{2,})\d{4}\b/i;
const BANK = /\b(a\/c|acct|account|neft|imps|rtgs|net\s*banking|bank)\b/i;

const CURRENCY: Record<string, string> = { "₹": "INR", rs: "INR", "rs.": "INR", inr: "INR", $: "USD", usd: "USD", "€": "EUR", eur: "EUR", "£": "GBP", gbp: "GBP", aed: "AED", sgd: "SGD" };
const AMOUNT_BEFORE = /(₹|rs\.?|inr|usd|\$|eur|€|gbp|£|aed|sgd)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const AMOUNT_AFTER = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(inr|rs\.?|usd|eur|gbp|aed|sgd)\b/i;

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Payee words that only describe how money moved, never who got it. */
const PAYEE_NOISE = /^(your|a\/c|ac|account|acct|card|upi|vpa|you|self|the|beneficiary|merchant|mr|ms|mrs)$/i;

function amountOf(text: string): { amount: number; currency: string } | null {
  const before = AMOUNT_BEFORE.exec(text);
  const after = before ? null : AMOUNT_AFTER.exec(text);
  const symbol = (before?.[1] ?? after?.[2] ?? "").toLowerCase();
  const digits = before?.[2] ?? after?.[1];
  if (!digits) return null;
  const amount = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return null;
  return { amount: Math.round(amount * 100) / 100, currency: CURRENCY[symbol] ?? CURRENCY[symbol.replace(/\.$/, "")] ?? "INR" };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDay(year: number, month: number, day: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year;
  if (month < 1 || month > 12 || day < 1 || day > 31 || fullYear < 2000 || fullYear > 2100) return null;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${fullYear}-${pad(month)}-${pad(day)}`;
}

/** The day it was paid. Indian banks write the day first ("20-11-26", "20/11/2026", "20-Nov-26", "20 Nov 2026"). */
export function paymentDay(text: string): string | null {
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (iso) return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = /\b(\d{1,2})[\s-]?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i.exec(text);
  if (named) return isoDay(Number(named[3]), MONTHS[named[2]!.toLowerCase()]!, Number(named[1]));
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text);
  if (numeric) return isoDay(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  return null;
}

function cleanPayee(raw: string | undefined): string | null {
  if (!raw) return null;
  let value = raw.replace(/[\s.,;:-]+$/, "").replace(/^[\s:-]+/, "").trim();
  // A UPI handle alone ("bescom.billdesk@hdfcbank"): its name part, read as words.
  const handle = /^([a-z0-9._-]+)@[a-z0-9.]+$/i.exec(value);
  if (handle) value = handle[1]!.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim();
  if (!value || value.length < 2 || value.length > 60) return null;
  if (value.split(/\s+/).every((word) => PAYEE_NOISE.test(word))) return null;
  return value;
}

/** Who was paid: "to VPA x@y NAME", "paid to NAME", "at NAME", "UPI/123/NAME". */
function payeeOf(text: string): string | null {
  const stop = String.raw`(?=\s+(?:on|via|ref|refno|ref\.?\s*no|upi|using|from|dated?|for|txn|avl|avbl|bal)\b|\s*[,;(]|\.(?:\s|$)|\s*$|\n)`;
  const patterns = [
    new RegExp(String.raw`\bto\s+vpa\s+[a-z0-9._-]+@[a-z0-9.]+\s+([A-Za-z][A-Za-z0-9 &'._-]{1,58}?)${stop}`, "i"),
    new RegExp(String.raw`\b(?:paid|sent|transferred|payment)\s+(?:of\s+\S+\s+)?to\s+([A-Za-z0-9][A-Za-z0-9 &'@._-]{1,58}?)${stop}`, "i"),
    new RegExp(String.raw`\bto\s+([A-Za-z][A-Za-z0-9 &'@._-]{1,58}?)${stop}`, "i"),
    new RegExp(String.raw`\b(?:at|towards|merchant)\s+([A-Za-z][A-Za-z0-9 &'._-]{1,58}?)${stop}`, "i"),
    /\bupi\/(?:p2[am]\/)?\d+\/([A-Za-z][A-Za-z0-9 &'._-]{1,40})/i,
  ];
  for (const pattern of patterns) {
    const found = cleanPayee(pattern.exec(text)?.[1]);
    if (found) return found;
  }
  return null;
}

/**
 * Reads one message as a payment proof, or says why it isn't one. Several
 * sources of the same content (what was sent, what was read off a picture)
 * are read together.
 */
export function readPaymentProof(...texts: (string | null | undefined)[]): PaymentRead {
  const text = texts.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n").slice(0, 4000);
  if (!text) return { proof: null, reason: "not_payment" };
  if (ASKS_TO_PAY.some((pattern) => pattern.test(text))) return { proof: null, reason: "asks_to_pay" };
  const method: PaymentMethod | null = UPI.test(text) ? "upi" : CARD.test(text) ? "card" : BANK.test(text) ? "bank" : null;
  const debit = DEBIT.test(text);
  if (!method) return { proof: null, reason: "not_payment" };
  if (!debit) return { proof: null, reason: CREDIT.test(text) ? "credit" : "not_payment" };
  const money = amountOf(text);
  if (!money) return { proof: null, reason: "no_amount" };
  return { proof: { ...money, payee: payeeOf(text), paidOn: paymentDay(text), method } };
}

// --- Matching a payment to the bill it paid -------------------------------

export type OpenBill = {
  id: string;
  name: string;
  payee: string | null;
  amountMinor: number | null;
  currency: string | null;
  dueOn: string | null;
  status: string;
};

export type PaymentMatch =
  /** The one bill it paid: marked paid as Checking; `amountConfirmed` when the bill's own amount agreed. */
  | { type: "paid"; billId: string; amountConfirmed: boolean }
  /** The bill it paid says a different amount: not marked paid; the nightly "unusual amount" question asks. */
  | { type: "amount_conflict"; billId: string }
  | { type: "none" };

const OPEN_STATUSES: ReadonlySet<string> = new Set(["expected", "received", "scheduled", "overdue"]);
/** A payment counts for a bill due up to this many days after it, or this many days before. */
const PAID_EARLY_DAYS = 25;
const PAID_LATE_DAYS = 10;
const WORD_NOISE = new Set(["ltd", "limited", "pvt", "private", "the", "and", "india", "co", "company", "inc", "llp", "bill", "payment", "payments", "services", "service", "bank", "billdesk", "razorpay", "payu", "upi", "online", "corp", "corporation"]);

function words(value: string | null | undefined): Set<string> {
  return new Set((normalizeWords(value) ?? "").split(/[\s.&'-]+/).filter((word) => word.length >= 3 && !WORD_NOISE.has(word)));
}

/** Whether the payment's payee is this bill's payee (or names the bill). */
export function samePayee(paid: string | null, bill: Pick<OpenBill, "name" | "payee">): boolean {
  if (!paid) return false;
  const key = vendorKey(paid);
  if (key && (key === vendorKey(bill.payee) || key === vendorKey(bill.name))) return true;
  const theirs = words(paid);
  if (theirs.size === 0) return false;
  const ours = new Set([...words(bill.payee), ...words(bill.name)]);
  for (const word of theirs) if (ours.has(word)) return true;
  const compact = (value: string | null) => (normalizeWords(value) ?? "").replace(/[^a-z0-9]/g, "");
  const said = compact(paid);
  return said.length >= 4 && [compact(bill.payee), compact(bill.name)].some((value) => value.length >= 4 && (value.includes(said) || said.includes(value)));
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

function agrees(bill: OpenBill, amountMinor: number): boolean {
  if (bill.amountMinor === null) return true;
  return Math.abs(bill.amountMinor - amountMinor) <= Math.max(100, Math.round(bill.amountMinor * 0.01));
}

/**
 * The bill a payment paid: payee, amount and a date window. One bill whose
 * amount agrees (or that has none yet) is paid; two or more equally close is
 * no match (never a guess). A bill whose amount disagrees is never paid.
 */
export function matchPaymentToBill(proof: PaymentProof, bills: readonly OpenBill[], today: string): PaymentMatch {
  const paidOn = proof.paidOn ?? today;
  const amountMinor = Math.round(proof.amount * 100);
  const candidates = bills.filter((bill) => {
    if (!OPEN_STATUSES.has(bill.status) || !samePayee(proof.payee, bill)) return false;
    if (bill.currency && bill.currency !== proof.currency) return false;
    if (!bill.dueOn) return true;
    const early = daysBetween(bill.dueOn, paidOn);
    return early <= PAID_EARLY_DAYS && early >= -PAID_LATE_DAYS;
  });
  if (candidates.length === 0) return { type: "none" };
  const distance = (bill: OpenBill) => (bill.dueOn ? Math.abs(daysBetween(bill.dueOn, paidOn)) : PAID_EARLY_DAYS + 1);
  const agreeing = candidates.filter((bill) => agrees(bill, amountMinor)).sort((a, b) => distance(a) - distance(b));
  if (agreeing.length > 0) {
    // Two bills equally close is ambiguous: neither is marked.
    if (agreeing.length > 1 && distance(agreeing[0]!) === distance(agreeing[1]!)) return { type: "none" };
    return { type: "paid", billId: agreeing[0]!.id, amountConfirmed: agreeing[0]!.amountMinor !== null };
  }
  const conflicting = [...candidates].sort((a, b) => distance(a) - distance(b));
  if (conflicting.length > 1 && distance(conflicting[0]!) === distance(conflicting[1]!)) return { type: "none" };
  return { type: "amount_conflict", billId: conflicting[0]!.id };
}

/** The title a payment with no bill is recorded under ("Paid to BESCOM"). */
export function paymentTitle(proof: PaymentProof): string {
  return (proof.payee ? `Paid to ${proof.payee}` : proof.method === "card" ? "Card payment" : proof.method === "upi" ? "UPI payment" : "Bank payment").slice(0, 160);
}
