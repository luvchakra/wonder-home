import { expectedDepletion, type Consumable } from "../commerce/consumables";
import { format, type Obligation } from "../finance/payments";
import type { SchoolItem } from "../school/items";

/**
 * Looking ahead (story 14-008): risks and opportunities in the next two
 * weeks, read from what the household has actually recorded.
 *
 * Each prediction is arithmetic over real rows. It names what it rests on
 * and how sure it can be, and it offers the one place to act. Nothing here
 * calls a model, and nothing is written: a prediction is a reading of the
 * household, never a change to it, and never a fact. Only three shapes are
 * predicted, each because it is useful earlier than the day it happens:
 *
 *   - several things running out in the same week: one shop instead of
 *     several (an opportunity);
 *   - bills bunching into a few days (a risk to plan cash for);
 *   - a child's exam landing in a week already full of other work (a risk
 *     to plan time for).
 *
 * The thresholds are deliberately high. A prediction that fires on an
 * ordinary week is noise, and noise is exactly what this product removes.
 */

export type PredictionBasis = "purchase_history" | "stated" | "scheduled";

export type Prediction = {
  key: string;
  kind: "risk" | "opportunity";
  domain: "groceries" | "bills" | "school";
  title: string;
  reason: string;
  /** The earliest day it concerns (YYYY-MM-DD). */
  on: string;
  /** What it rests on: the household's buying pattern, what it told WonderHome, or dates already set. */
  basis: PredictionBasis;
  /** Where the household acts on it. */
  href: string;
};

export const HORIZON_DAYS = 14;
export const STOCK_OUT = { windowDays: 7, minItems: 3 } as const;
export const BILL_BUNCH = { windowDays: 5, minBills: 2 } as const;
export const HEAVY_WEEK = { minOtherItems: 3 } as const;

const DAY = 86_400_000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function readable(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function listed(names: readonly string[], max = 4): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const body = shown.length <= 1 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : body;
}

/** Several things running out within one week of each other: one shop before the first. */
export function predictStockOuts(consumables: readonly Consumable[], now: Date): Prediction[] {
  const until = now.getTime() + HORIZON_DAYS * DAY;
  const running = consumables
    .map((consumable) => ({ consumable, on: expectedDepletion(consumable, now) }))
    .filter((entry): entry is { consumable: Consumable; on: Date } => entry.on !== null && entry.on.getTime() >= now.getTime() && entry.on.getTime() <= until)
    .sort((a, b) => a.on.getTime() - b.on.getTime());

  const predictions: Prediction[] = [];
  let index = 0;
  while (index < running.length) {
    const first = running[index]!;
    const window = running.filter((entry) => entry.on.getTime() >= first.on.getTime() && entry.on.getTime() < first.on.getTime() + STOCK_OUT.windowDays * DAY);
    if (window.length >= STOCK_OUT.minItems) {
      const allObserved = window.every((entry) => entry.consumable.evidenceBasis === "purchase_history");
      predictions.push({
        key: `stock_out:${isoDay(first.on)}`,
        kind: "opportunity",
        domain: "groceries",
        title: `One shop covers ${window.length} things`,
        reason: `${listed(window.map((entry) => entry.consumable.name))} are likely to run out within a week of ${readable(first.on)}. Getting them together saves ${window.length - 1} extra ${window.length - 1 === 1 ? "trip" : "trips"}.`,
        on: isoDay(first.on),
        basis: allObserved ? "purchase_history" : "stated",
        href: "/groceries",
      });
      index += window.length;
    } else {
      index += 1;
    }
  }
  return predictions;
}

const SETTLED: ReadonlySet<Obligation["status"]> = new Set(["paid", "waived", "cancelled"]);

/** Two or more bills due within a few days of each other. */
export function predictBillBunching(obligations: readonly Obligation[], now: Date): Prediction[] {
  const today = isoDay(now);
  const until = isoDay(new Date(now.getTime() + HORIZON_DAYS * DAY));
  const due = obligations
    .filter((obligation) => obligation.dueOn && !SETTLED.has(obligation.status) && obligation.dueOn >= today && obligation.dueOn <= until)
    .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));

  for (let index = 0; index < due.length; index += 1) {
    const first = due[index]!;
    const start = new Date(`${first.dueOn}T00:00:00Z`).getTime();
    const bunch = due.filter((obligation) => {
      const at = new Date(`${obligation.dueOn}T00:00:00Z`).getTime();
      return at >= start && at < start + BILL_BUNCH.windowDays * DAY;
    });
    if (bunch.length < BILL_BUNCH.minBills) continue;

    const known = bunch.filter((obligation) => obligation.amountMinor !== null && obligation.currency !== null);
    const currencies = new Set(known.map((obligation) => obligation.currency));
    const unknown = bunch.length - known.length;
    let money = "";
    if (known.length > 0 && currencies.size === 1) {
      const total = known.reduce((sum, obligation) => sum + obligation.amountMinor!, 0);
      money = ` — ${format(total, [...currencies][0]!)}${unknown > 0 ? `, plus ${unknown} whose amount isn't in yet` : ""}`;
    } else if (unknown === bunch.length) {
      money = ", amounts not in yet";
    }
    return [
      {
        key: `bills:${first.dueOn}`,
        kind: "risk",
        domain: "bills",
        title: `${bunch.length} bills fall due within ${BILL_BUNCH.windowDays} days`,
        reason: `${listed(bunch.map((obligation) => obligation.name))} are due between ${readable(new Date(start))} and ${readable(new Date(`${bunch[bunch.length - 1]!.dueOn}T00:00:00Z`))}${money}.`,
        on: first.dueOn!,
        basis: "scheduled",
        href: "/bills",
      },
    ];
  }
  return [];
}

const OPEN: ReadonlySet<SchoolItem["status"]> = new Set(["pending", "in_progress"]);

function weekStart(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (start.getUTCDay() + 6) % 7; // Monday
  return new Date(start.getTime() - offset * DAY);
}

/** A child's exam in a week that already holds several other things due. */
export function predictHeavySchoolWeeks(
  items: readonly SchoolItem[],
  childName: (childMemberId: string) => string,
  now: Date,
): Prediction[] {
  const until = now.getTime() + HORIZON_DAYS * DAY;
  const upcoming = items.filter((item) => item.dueAt && OPEN.has(item.status) && item.dueAt.getTime() >= now.getTime() && item.dueAt.getTime() <= until);
  const predictions: Prediction[] = [];
  const weeks = new Map<string, SchoolItem[]>();
  for (const item of upcoming) {
    const key = `${item.childMemberId}:${isoDay(weekStart(item.dueAt!))}`;
    weeks.set(key, [...(weeks.get(key) ?? []), item]);
  }
  for (const [key, inWeek] of weeks) {
    const exams = inWeek.filter((item) => item.kind === "exam");
    const other = inWeek.filter((item) => item.kind === "homework" || item.kind === "project" || item.kind === "worksheet");
    if (exams.length === 0 || other.length < HEAVY_WEEK.minOtherItems) continue;
    const [childId, week] = key.split(":") as [string, string];
    const name = childName(childId);
    predictions.push({
      key: `school_week:${key}`,
      kind: "risk",
      domain: "school",
      title: `A full week for ${name}`,
      reason: `${exams.length === 1 ? `The ${exams[0]!.title} exam` : `${exams.length} exams`} and ${other.length} other things are due the week of ${readable(new Date(`${week}T00:00:00Z`))}. Starting some of it this week spreads the load.`,
      on: isoDay(exams.map((exam) => exam.dueAt!).sort((a, b) => a.getTime() - b.getTime())[0]!),
      basis: "scheduled",
      href: "/school",
    });
  }
  return predictions.sort((a, b) => a.on.localeCompare(b.on));
}

/** Everything worth saying about the next two weeks, soonest first. */
export function predictHousehold(input: {
  consumables: readonly Consumable[];
  obligations: readonly Obligation[];
  schoolItems: readonly SchoolItem[];
  childName: (childMemberId: string) => string;
  now?: Date;
}): Prediction[] {
  const now = input.now ?? new Date();
  return [
    ...predictStockOuts(input.consumables, now),
    ...predictBillBunching(input.obligations, now),
    ...predictHeavySchoolWeeks(input.schoolItems, input.childName, now),
  ].sort((a, b) => a.on.localeCompare(b.on));
}

/** How a prediction's basis is said to a person. */
export function describePredictionBasis(basis: PredictionBasis): string {
  return basis === "purchase_history" ? "From your buying pattern" : basis === "stated" ? "From what you told WonderHome" : "From dates already set";
}
