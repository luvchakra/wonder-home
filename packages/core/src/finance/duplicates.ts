import { BILL_TYPES } from "./bill-catalog";
import { PAYEES } from "./payees";
import type { Obligation } from "./payments";

/**
 * Bills that look like the same bill entered more than once (the owner,
 * 2026-11-20: "many electricity items are there so there should be option to
 * clean up easily"). A suggestion for a person, worked out from the records
 * alone — never a model's say-so — and never applied by itself: nothing is
 * removed or merged unless a person picks it, and nothing is ever paid.
 *
 * Two open bills are the same bill when they are the same kind of bill (the
 * typical bill picked, or else the word or payee in the name: "BESCOM
 * electricity bill for October" and "Electricity bill" are both electricity)
 * and fall due within `SAME_BILL_DAYS` of each other. Bills of one kind a
 * month or more apart are the same bill's different months — related, never
 * duplicates. A bill with no due date is never called a duplicate: there is
 * nothing to say it is the same one.
 */

export const SAME_BILL_DAYS = 7;

/** What a bill is, for comparing: a typical bill's key ("electricity"), else its own name. */
export type BillCategory = { key: string; typical: boolean };

const KEYWORDS: readonly [string, readonly string[]][] = [
  ["electricity", ["electricity", "electric", "power", "bescom", "tneb", "msedcl", "electricity board"]],
  ["piped_gas", ["piped gas", "png", "gas"]],
  ["lpg", ["lpg", "cylinder"]],
  ["water", ["water"]],
  ["broadband", ["broadband", "fiber", "fibre", "internet", "wifi", "wi fi"]],
  ["mobile", ["mobile", "postpaid", "prepaid"]],
  ["dth", ["dth", "dish tv"]],
  ["rent", ["rent"]],
  ["maintenance", ["maintenance"]],
  ["credit_card", ["credit card"]],
];

const TYPICAL: ReadonlySet<string> = new Set(BILL_TYPES.map((type) => type.key));

const words = (value: string) => ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** The kind of bill this is, from what the household picked, the words in its name, or a payee it names. */
export function billCategory(bill: Pick<Obligation, "name" | "payee" | "billType">): BillCategory {
  if (bill.billType && TYPICAL.has(bill.billType)) return { key: bill.billType, typical: true };
  const text = words(`${bill.name} ${bill.payee ?? ""}`);
  for (const [key, terms] of KEYWORDS) if (terms.some((term) => text.includes(` ${term} `))) return { key, typical: true };
  // A payee the catalogue knows ("BESCOM", "Airtel Xstream Fiber"): the longest name wins, so "Airtel Xstream Fiber" is broadband, not mobile.
  const payee = [...PAYEES]
    .filter((candidate) => text.includes(words(candidate.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (payee && TYPICAL.has(payee.category)) return { key: payee.category, typical: true };
  return { key: words(bill.name).trim(), typical: false };
}

export type TidyBill = Pick<Obligation, "id" | "name" | "payee" | "amountMinor" | "currency" | "dueOn" | "status" | "updatedAt"> & {
  billType?: string | null;
  /** Still Checking: HomeSend added it and nobody has confirmed it. */
  checking: boolean;
  /** HomeSend added it from something sent in (a document or message on file). */
  fromSource: boolean;
};

/** Why the suggested one is suggested, in that order of weight. */
export type KeepReason = "confirmed" | "source" | "amount" | "newest";

export type DuplicateGroup = {
  category: BillCategory;
  /** Oldest due date first. */
  ids: string[];
  keepId: string;
  keepBecause: KeepReason;
  /** Every bill in the group falls due on the same day. */
  sameDay: boolean;
};

export type BillSeries = { category: BillCategory; ids: string[] };

export type TidyPlan = {
  /** Bills that look like one bill entered more than once. */
  duplicates: DuplicateGroup[];
  /** Every kind with more than one open bill, due-date order: what "Tidy up" lists together. */
  series: BillSeries[];
};

const DAY_MS = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

const OPEN = new Set(["expected", "received", "scheduled", "overdue"]);

function keepScore(bill: TidyBill): number {
  return (bill.checking ? 0 : 4) + (bill.fromSource ? 2 : 0) + (bill.amountMinor !== null ? 1 : 0);
}

function suggestKeep(bills: readonly TidyBill[]): { id: string; because: KeepReason } {
  const ranked = [...bills].sort(
    (a, b) => keepScore(b) - keepScore(a) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.id.localeCompare(b.id),
  );
  const best = ranked[0]!;
  const others = ranked.slice(1);
  const because: KeepReason =
    !best.checking && others.some((other) => other.checking)
      ? "confirmed"
      : best.fromSource && others.some((other) => !other.fromSource)
        ? "source"
        : best.amountMinor !== null && others.some((other) => other.amountMinor === null)
          ? "amount"
          : "newest";
  return { id: best.id, because };
}

const byDue = (a: TidyBill, b: TidyBill) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.name.localeCompare(b.name);

export function planTidy(bills: readonly TidyBill[]): TidyPlan {
  const open = bills.filter((bill) => OPEN.has(bill.status));
  const byCategory = new Map<string, { category: BillCategory; bills: TidyBill[] }>();
  for (const bill of open) {
    const category = billCategory(bill);
    const entry = byCategory.get(category.key) ?? { category, bills: [] };
    entry.bills.push(bill);
    byCategory.set(category.key, entry);
  }

  const duplicates: DuplicateGroup[] = [];
  const series: BillSeries[] = [];
  for (const { category, bills: same } of byCategory.values()) {
    const sorted = [...same].sort(byDue);
    if (sorted.length > 1) series.push({ category, ids: sorted.map((bill) => bill.id) });
    // Chains of bills each within the window of the one before: one bill, entered more than once.
    const dated = sorted.filter((bill) => bill.dueOn);
    let run: TidyBill[] = [];
    const close = () => {
      if (run.length > 1) {
        const keep = suggestKeep(run);
        duplicates.push({
          category,
          ids: run.map((bill) => bill.id),
          keepId: keep.id,
          keepBecause: keep.because,
          sameDay: run.every((bill) => bill.dueOn === run[0]!.dueOn),
        });
      }
      run = [];
    };
    for (const bill of dated) {
      const last = run[run.length - 1];
      if (last && daysApart(last.dueOn!, bill.dueOn!) > SAME_BILL_DAYS) close();
      run.push(bill);
    }
    close();
  }
  duplicates.sort((a, b) => a.ids[0]!.localeCompare(b.ids[0]!));
  const firstDue = (ids: string[]) => open.find((bill) => bill.id === ids[0])?.dueOn ?? "9999";
  duplicates.sort((a, b) => firstDue(a.ids).localeCompare(firstDue(b.ids)));
  series.sort((a, b) => firstDue(a.ids).localeCompare(firstDue(b.ids)));
  return { duplicates, series };
}
