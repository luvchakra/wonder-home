import { isoDate, silent, type HomeAssessment } from "./assessment";
import { isFresh, type DeviceSignal } from "./signals";
import type { DryingConditions } from "./weather";

/**
 * Laundry readiness (story 13-003).
 *
 * The backlog's rule, restated because it decides everything below: laundry is
 * a readiness outcome tied to a real deadline, and no wash/dry/fold check-ins
 * are required. Nobody in the household — helper or family — tells WonderHome
 * that a load went in.
 *
 * So state is inferred, and when it cannot be inferred the answer is "we do not
 * know", which is handled rather than hidden. The only question this module
 * ever asks is whether what somebody needs will be ready when they need it.
 */

export const LAUNDRY_STATES = ["unknown", "soiled", "in_wash", "drying", "ready"] as const;
export type LaundryState = (typeof LAUNDRY_STATES)[number];

export type LaundryNeed = {
  id: string;
  /** What the family calls it: "Aarav's school uniform". */
  label: string;
  forMemberId: string | null;
  neededBy: Date;
  state: LaundryState;
  /** When the state was last established, by observation rather than a check-in. */
  stateAsOf: Date | null;
  /** How long this takes to dry indoors in ordinary conditions. */
  dryingHours: number;
  /** Some things only dry outside, which is where weather starts to matter. */
  requiresOutdoorDrying: boolean;
};

/** How long a wash cycle takes, for the purpose of working backwards from a deadline. */
export const WASH_HOURS = 2;

/** Ironing, folding, getting it back to a wardrobe — the part after it is dry. */
export const FINISHING_HOURS = 1;

/**
 * Hours still needed before this is genuinely ready.
 *
 * `unknown` is treated as the worst case rather than an average. Being wrong
 * optimistically means a child leaves for school in yesterday's shirt; being
 * wrong pessimistically means one avoidable question. Those are not
 * symmetrical.
 */
export function hoursRemaining(need: LaundryNeed, conditions: DryingConditions): number {
  const drying = need.dryingHours * conditions.hoursMultiplier;

  switch (need.state) {
    case "ready":
      return 0;
    case "drying":
      return drying + FINISHING_HOURS;
    case "in_wash":
      return drying + FINISHING_HOURS;
    case "soiled":
    case "unknown":
      return WASH_HOURS + drying + FINISHING_HOURS;
  }
}

/**
 * Updates state from a device signal rather than from a person (story 13-008).
 *
 * This is the mechanism that lets 13-003 hold: the state moves because a
 * machine finished a cycle, not because somebody remembered to tell us.
 */
export function applySignal(need: LaundryNeed, signal: DeviceSignal, now: Date): LaundryNeed {
  if (!isFresh(signal, now)) return need;
  if (signal.kind !== "cycle_complete") return need;

  // A completed cycle moves a wash to drying; it says nothing about anything else.
  if (need.state === "in_wash" || need.state === "unknown") {
    return { ...need, state: "drying", stateAsOf: signal.observedAt };
  }
  return need;
}

export type LaundryContext = {
  now: Date;
  conditions: DryingConditions;
  /** Whether anybody is around to start a load, from availability. */
  someoneAvailable: boolean;
};

/**
 * Whether this will be ready in time, and what to do if not.
 *
 * Note what is absent: any notion of progress, any percentage, any prompt to
 * confirm a step. The household hears from this function when something they
 * need will not be there, and otherwise not at all.
 */
export function assessLaundry(need: LaundryNeed, context: LaundryContext): HomeAssessment {
  const subjectKey = `laundry.${need.id}`;
  const hoursLeft = (need.neededBy.getTime() - context.now.getTime()) / 3_600_000;
  const hoursNeeded = hoursRemaining(need, context.conditions);

  if (need.state === "ready") {
    return silent(subjectKey, `${need.label} is ready.`);
  }

  if (hoursLeft < 0) {
    return {
      subjectKey,
      status: "missed",
      riskLevel: "high",
      notable: true,
      reason: `${need.label} was needed ${Math.abs(Math.round(hoursLeft))} hours ago and is not ready.`,
      action: { action: "find_alternative", target: need.id },
      dueOn: isoDate(need.neededBy),
    };
  }

  if (hoursNeeded > hoursLeft) {
    const outdoorProblem = need.requiresOutdoorDrying && !context.conditions.outdoorViable;
    return {
      subjectKey,
      status: "at_risk",
      riskLevel: "high",
      notable: true,
      reason: outdoorProblem
        ? `${need.label} will not dry in time: ${context.conditions.reason}`
        : `${need.label} needs about ${Math.ceil(hoursNeeded)} hours and there are ${Math.floor(hoursLeft)}.`,
      action: outdoorProblem
        ? { action: "dry_indoors", target: need.id }
        : { action: "start_now", target: need.id },
      dueOn: isoDate(need.neededBy),
    };
  }

  // Tight but achievable, and nobody is there to start it. That combination is
  // the one worth a word — not the deadline, and not the empty house alone.
  if (!context.someoneAvailable && hoursNeeded > hoursLeft - WASH_HOURS) {
    return {
      subjectKey,
      status: "at_risk",
      riskLevel: "medium",
      notable: true,
      reason: `${need.label} still needs doing and nobody is home to start it.`,
      action: { action: "find_cover", target: need.id },
      dueOn: isoDate(need.neededBy),
    };
  }

  return silent(subjectKey, `${need.label} will be ready in time.`);
}
