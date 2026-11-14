import type { HomeSendKind } from "../homesend/items";
import { DEFAULT_AUTO_ADD_PERCENT } from "../homesend/auto-add";

/**
 * Each kind's bar for adding on its own, from the household's own accuracy
 * (Nothing stuck in review, phase 3). Where an Admin has not picked a bar,
 * HomeSend no longer uses one 95% for everything: a kind the household
 * rarely undoes or corrects gets a lower bar, one it often corrects a higher
 * one, always within fixed limits. Pure; the history is read and the result
 * stored nightly by `kind-bar-repository.ts`.
 *
 * The limits (documented in docs/agent-platform.md, tested in
 * kind-bar.test.ts):
 *   * never below 80% (`MIN_BAR`), never above 99% (`MAX_BAR`);
 *   * fewer than 10 entries of a kind in 90 days: 95%, the default;
 *   * the error rate is (undone + corrected) / added over those 90 days,
 *     an entry undone and corrected counted once;
 *       ≥ 50 added and no errors at all     → 80%
 *       ≥ 20 added and under 2% errors      → 85%
 *       ≥ 10 added and under 5% (1 in 20)   → 90%
 *       under 10%                           → 95%
 *       under 20%                           → 97%
 *       20% or more                         → 99%
 *   * an Admin's chosen bar always wins (`effectiveBar`).
 *
 * The bar only decides whether an entry is added confirmed or as Checking.
 * It never lets anything be paid, ordered or approved, and the money and
 * health rules, autonomy and the "untraced" rule apply on top of it.
 */

export const MIN_BAR = 80;
export const MAX_BAR = 99;
export const MIN_HISTORY = 10;
export const WINDOW_DAYS = 90;

export const BAR_KINDS = ["bill", "school_item", "activity_item", "event", "grocery_item", "health_document", "receipt"] as const satisfies readonly HomeSendKind[];
export type BarKind = (typeof BAR_KINDS)[number];

export type KindHistory = { added: number; undone: number; corrected: number };
export type KindBar = KindHistory & { kind: BarKind; percent: number };

/** The bar a kind's history earns, within the limits above. */
export function barFromHistory(history: KindHistory): number {
  const added = Math.max(0, Math.floor(history.added));
  if (added < MIN_HISTORY) return DEFAULT_AUTO_ADD_PERCENT;
  const errors = Math.min(added, Math.max(0, history.undone) + Math.max(0, history.corrected));
  const rate = errors / added;
  let percent: number;
  if (added >= 50 && errors === 0) percent = 80;
  else if (added >= 20 && rate < 0.02) percent = 85;
  else if (rate < 0.05) percent = 90;
  else if (rate < 0.1) percent = 95;
  else if (rate < 0.2) percent = 97;
  else percent = 99;
  return Math.min(MAX_BAR, Math.max(MIN_BAR, percent));
}

/** homesend_changes.domain → the HomeSend kind it was read as. */
export function kindOfDomain(domain: string): BarKind | null {
  switch (domain) {
    case "bill":
    case "school_item":
    case "activity_item":
    case "event":
    case "grocery_item":
    case "health_document":
      return domain;
    case "activity":
      return "activity_item";
    case "purchase":
      return "receipt";
    default:
      return null;
  }
}

export type ChangeRow = { domain: string; undone: boolean; corrected: boolean };

/** Counts each kind's entries, undos and corrections; one entry undone and corrected counts as one error. */
export function historyByKind(rows: readonly ChangeRow[]): Map<BarKind, KindHistory> {
  const byKind = new Map<BarKind, KindHistory>();
  for (const row of rows) {
    const kind = kindOfDomain(row.domain);
    if (!kind) continue;
    const history = byKind.get(kind) ?? { added: 0, undone: 0, corrected: 0 };
    history.added += 1;
    if (row.undone) history.undone += 1;
    else if (row.corrected) history.corrected += 1;
    byKind.set(kind, history);
  }
  return byKind;
}

export type BarBasis = "admin" | "learned" | "default";
export type EffectiveBar = { percent: number; basis: BarBasis; history: KindHistory | null };

/**
 * The bar HomeSend uses for one kind: the Admin's when they picked one,
 * else the kind's learned bar, else 95%.
 */
export function effectiveBar(input: { kind: HomeSendKind | null; adminPercent: number | null; learned: readonly KindBar[] }): EffectiveBar {
  if (input.adminPercent !== null) return { percent: input.adminPercent, basis: "admin", history: null };
  const found = input.learned.find((bar) => bar.kind === input.kind);
  if (!found) return { percent: DEFAULT_AUTO_ADD_PERCENT, basis: "default", history: null };
  const percent = Math.min(MAX_BAR, Math.max(MIN_BAR, found.percent));
  return { percent, basis: found.added >= MIN_HISTORY ? "learned" : "default", history: { added: found.added, undone: found.undone, corrected: found.corrected } };
}
