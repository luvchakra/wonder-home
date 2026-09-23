/**
 * Who carries what, and a fairer split when one person carries far more
 * (story 03-008).
 *
 * Load is arithmetic anyone can check: every outcome a person is primary
 * for, counted by how many times a week it comes round. A daily outcome is
 * 7, a weekly one is 1, a monthly one is about 0.25. An outcome whose rhythm
 * the household never set counts as weekly, and the screen says so rather
 * than inventing a precision nobody gave it.
 *
 * Children are never given more to do, and helpers are never asked to take
 * on a family member's outcome: rebalancing happens among the adults, and
 * among helpers, separately. A suggestion is only ever a swap the
 * household already half-made: the outcome's named backup becomes its
 * owner, and the owner becomes the backup. Nobody is handed something they
 * have never been part of, and nothing changes until an Admin accepts.
 */

import { z } from "zod";

/** Accepting one suggested swap, as the API takes it. */
export const rebalanceSchema = z.object({
  outcomeKey: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/),
  fromMemberId: z.uuid(),
  toMemberId: z.uuid(),
});

export type WorkloadMember = { id: string; displayName: string; memberType: "adult" | "child" | "helper" };

export type WorkloadOutcome = {
  outcomeKey: string;
  name: string;
  primaryMemberId: string | null;
  backupMemberId: string | null;
  /** The playbook item's `cadence.unit`, when the household set one. */
  cadenceUnit: string | null;
};

export type MemberLoad = {
  memberId: string;
  displayName: string;
  memberType: WorkloadMember["memberType"];
  outcomes: number;
  /** Times a week, summed over the outcomes they own. */
  perWeek: number;
  /** How many of those had no rhythm set and were counted as weekly. */
  assumedWeekly: number;
};

export type RebalanceSuggestion = {
  outcomeKey: string;
  outcomeName: string;
  fromMemberId: string;
  toMemberId: string;
  /** The loads, in times a week, before and after the swap. */
  before: { from: number; to: number };
  after: { from: number; to: number };
  reason: string;
};

/** How many times a week an outcome comes round, and whether that was assumed. */
export function timesPerWeek(cadenceUnit: string | null): { perWeek: number; assumed: boolean } {
  switch ((cadenceUnit ?? "").toLowerCase()) {
    case "day":
    case "daily":
      return { perWeek: 7, assumed: false };
    case "week":
    case "weekly":
      return { perWeek: 1, assumed: false };
    case "fortnight":
    case "fortnightly":
      return { perWeek: 0.5, assumed: false };
    case "month":
    case "monthly":
      return { perWeek: 0.25, assumed: false };
    case "year":
    case "yearly":
    case "annual":
      return { perWeek: 0.02, assumed: false };
    default:
      return { perWeek: 1, assumed: true };
  }
}

export function memberLoads(members: readonly WorkloadMember[], outcomes: readonly WorkloadOutcome[]): MemberLoad[] {
  return members.map((member) => {
    const owned = outcomes.filter((outcome) => outcome.primaryMemberId === member.id);
    let perWeek = 0;
    let assumedWeekly = 0;
    for (const outcome of owned) {
      const rhythm = timesPerWeek(outcome.cadenceUnit);
      perWeek += rhythm.perWeek;
      if (rhythm.assumed) assumedWeekly += 1;
    }
    return {
      memberId: member.id,
      displayName: member.displayName,
      memberType: member.memberType,
      outcomes: owned.length,
      perWeek: round(perWeek),
      assumedWeekly,
    };
  });
}

/**
 * The imbalance worth acting on: someone carrying at least twice as much as
 * the lightest person in their group, and at least 5 more times a week.
 * A small difference is how households naturally are, not a problem.
 */
export const IMBALANCE = { ratio: 2, minGapPerWeek: 5 } as const;

/**
 * Up to three swaps that each narrow the gap between the heaviest and
 * lightest person in a group, heaviest first. A swap that would simply
 * move the imbalance the other way is not offered.
 */
export function suggestRebalance(
  members: readonly WorkloadMember[],
  outcomes: readonly WorkloadOutcome[],
  limit = 3,
): RebalanceSuggestion[] {
  const loads = new Map(memberLoads(members, outcomes).map((load) => [load.memberId, load.perWeek]));
  const typeOf = new Map(members.map((member) => [member.id, member.memberType]));
  const nameOf = new Map(members.map((member) => [member.id, member.displayName]));
  const suggestions: RebalanceSuggestion[] = [];
  const moved = new Set<string>();

  for (const group of ["adult", "helper"] as const) {
    for (let round_ = 0; round_ < limit && suggestions.length < limit; round_ += 1) {
      const inGroup = members.filter((member) => member.memberType === group);
      if (inGroup.length < 2) break;
      const sorted = [...inGroup].sort((a, b) => (loads.get(b.id) ?? 0) - (loads.get(a.id) ?? 0));
      const heaviest = sorted[0]!;
      const heavy = loads.get(heaviest.id) ?? 0;
      const lightest = loads.get(sorted[sorted.length - 1]!.id) ?? 0;
      if (!(heavy >= IMBALANCE.ratio * Math.max(lightest, 0.5) && heavy - lightest >= IMBALANCE.minGapPerWeek)) break;

      // Candidates: the heaviest person's outcomes whose backup is a lighter
      // member of the same group. The best swap brings the two closest.
      let best: { outcome: WorkloadOutcome; to: string; weight: number; spread: number } | null = null;
      for (const outcome of outcomes) {
        if (outcome.primaryMemberId !== heaviest.id || moved.has(outcome.outcomeKey)) continue;
        const to = outcome.backupMemberId;
        if (!to || typeOf.get(to) !== group) continue;
        const weight = timesPerWeek(outcome.cadenceUnit).perWeek;
        const fromAfter = heavy - weight;
        const toAfter = (loads.get(to) ?? 0) + weight;
        // It must actually narrow the gap between these two, not flip it.
        if (Math.abs(fromAfter - toAfter) >= heavy - (loads.get(to) ?? 0)) continue;
        const spread = Math.abs(fromAfter - toAfter);
        if (!best || spread < best.spread) best = { outcome, to, weight, spread };
      }
      if (!best) break;

      const toBefore = loads.get(best.to) ?? 0;
      loads.set(heaviest.id, round(heavy - best.weight));
      loads.set(best.to, round(toBefore + best.weight));
      moved.add(best.outcome.outcomeKey);
      suggestions.push({
        outcomeKey: best.outcome.outcomeKey,
        outcomeName: best.outcome.name,
        fromMemberId: heaviest.id,
        toMemberId: best.to,
        before: { from: round(heavy), to: round(toBefore) },
        after: { from: round(heavy - best.weight), to: round(toBefore + best.weight) },
        reason: `${nameOf.get(heaviest.id)} carries ${formatPerWeek(heavy)} a week and ${nameOf.get(best.to)} ${formatPerWeek(toBefore)}. ${nameOf.get(best.to)} already backs this up; swapping makes it ${formatPerWeek(heavy - best.weight)} and ${formatPerWeek(toBefore + best.weight)}.`,
      });
    }
  }
  return suggestions;
}

/** "7 times", "about 1 time", "less than once" — a load said the way a person would. */
export function formatPerWeek(perWeek: number): string {
  const value = round(perWeek);
  if (value === 0) return "nothing";
  if (value < 1) return "less than once";
  const whole = Math.round(value);
  const prefix = Number.isInteger(value) ? "" : "about ";
  return `${prefix}${whole} ${whole === 1 ? "time" : "times"}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export type Imbalance = { group: "adult" | "helper"; heaviest: MemberLoad; lightest: MemberLoad };

/** Each group whose heaviest person carries enough more than its lightest to be worth a word. */
export function findImbalances(loads: readonly MemberLoad[]): Imbalance[] {
  const found: Imbalance[] = [];
  for (const group of ["adult", "helper"] as const) {
    const inGroup = loads.filter((load) => load.memberType === group);
    if (inGroup.length < 2) continue;
    const sorted = [...inGroup].sort((a, b) => b.perWeek - a.perWeek);
    const heaviest = sorted[0]!;
    const lightest = sorted[sorted.length - 1]!;
    if (heaviest.perWeek >= IMBALANCE.ratio * Math.max(lightest.perWeek, 0.5) && heaviest.perWeek - lightest.perWeek >= IMBALANCE.minGapPerWeek) {
      found.push({ group, heaviest, lightest });
    }
  }
  return found;
}
