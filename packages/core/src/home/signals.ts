/**
 * Smart-home and device signals (stories 13-008, and the "where signals exist"
 * half of 13-002).
 *
 * Devices are optional, and the product has to work completely without them.
 * That constraint decides the design: a signal never becomes a source of truth,
 * it only moves an existing judgement. A household with no sensors gets the
 * same outcomes, reasoned from schedule and history instead.
 *
 * The second rule is that a signal is used only when it could change a
 * decision. A washing machine reporting that it finished a cycle at 3am is not
 * news; the same signal is worth something when somebody needed a uniform ready
 * by morning and we did not otherwise know.
 */

export const SIGNAL_KINDS = [
  "cycle_complete",
  "power_draw",
  "door",
  "motion",
  "moisture",
  "temperature",
  "supply_level",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export type DeviceSignal = {
  deviceKey: string;
  kind: SignalKind;
  observedAt: Date;
  /** Numeric reading where the kind has one; booleans are 1 and 0. */
  value: number;
  /** How much the device itself is trusted, 0..1. */
  confidence: number;
};

/**
 * How long a reading stands before it says nothing about now.
 *
 * A door sensor's last report is meaningless by tomorrow; a supply level is
 * still roughly true. Treating both as current is how a system ends up
 * confidently wrong.
 */
export const SIGNAL_FRESHNESS_HOURS: Record<SignalKind, number> = {
  cycle_complete: 24,
  power_draw: 6,
  door: 2,
  motion: 2,
  moisture: 12,
  temperature: 3,
  supply_level: 72,
};

export function isFresh(signal: DeviceSignal, now: Date): boolean {
  const ageHours = (now.getTime() - signal.observedAt.getTime()) / 3_600_000;
  return ageHours >= 0 && ageHours <= SIGNAL_FRESHNESS_HOURS[signal.kind];
}

export type Verification = {
  verified: boolean;
  /** Always 'observed': a device reports, it does not confirm on a family's behalf. */
  source: "observed";
  confidence: number;
  reason: string;
};

/**
 * Whether a signal is enough to call something done (story 13-008).
 *
 * The confidence floor exists because a cheap sensor's guess and a person's
 * word should never be recorded the same way. Below it we keep waiting rather
 * than assert something the household would have to correct later.
 */
export const VERIFICATION_CONFIDENCE_FLOOR = 0.7;

export function verifyWith(
  signal: DeviceSignal | null,
  expectation: { kind: SignalKind; atLeast?: number },
  now: Date,
): Verification {
  if (!signal || signal.kind !== expectation.kind) {
    return { verified: false, source: "observed", confidence: 0, reason: "No device reported this." };
  }
  if (!isFresh(signal, now)) {
    return { verified: false, source: "observed", confidence: 0, reason: "The last reading is too old to mean anything now." };
  }
  if (expectation.atLeast !== undefined && signal.value < expectation.atLeast) {
    return {
      verified: false,
      source: "observed",
      confidence: signal.confidence,
      reason: "The device reported, but not what we were waiting for.",
    };
  }
  if (signal.confidence < VERIFICATION_CONFIDENCE_FLOOR) {
    return {
      verified: false,
      source: "observed",
      confidence: signal.confidence,
      reason: "The device is not reliable enough to settle this on its own.",
    };
  }

  return {
    verified: true,
    source: "observed",
    confidence: signal.confidence,
    reason: "A device confirmed it.",
  };
}

/**
 * Whether a signal is worth acting on at all.
 *
 * `wouldChange` is the caller's own answer to "does this alter what we would
 * otherwise do?". Making the caller supply it keeps the judgement where the
 * context is, and makes the rule visible at every call site rather than buried
 * in a heuristic here.
 */
export function signalIsUseful(
  signal: DeviceSignal,
  now: Date,
  wouldChange: boolean,
): { use: boolean; because: string } {
  if (!isFresh(signal, now)) return { use: false, because: "Stale reading." };
  if (!wouldChange) return { use: false, because: "Nothing about this would change what we do." };
  return { use: true, because: "This changes what the household should do." };
}

export type WearAssessment = {
  /** Days to bring a scheduled service forward by, never pushed back. */
  bringForwardDays: number;
  reason: string;
};

/**
 * Whether device readings suggest a machine is heading for failure (13-002).
 *
 * Only ever brings a service *forward*. A quiet appliance is not evidence that
 * it is healthy — it may simply be unplugged, or the sensor may have died — so
 * signals may raise concern and never lower it.
 */
export function assessWear(
  signals: readonly DeviceSignal[],
  baseline: { powerDraw: number | null },
  now: Date,
): WearAssessment {
  const fresh = signals.filter((signal) => isFresh(signal, now));

  const draws = fresh.filter((signal) => signal.kind === "power_draw");
  if (baseline.powerDraw !== null && draws.length > 0) {
    const average = draws.reduce((total, signal) => total + signal.value, 0) / draws.length;
    const excess = average / baseline.powerDraw;
    if (excess >= 1.5) {
      return { bringForwardDays: 60, reason: "Drawing half again as much power as it used to." };
    }
    if (excess >= 1.25) {
      return { bringForwardDays: 30, reason: "Drawing noticeably more power than it used to." };
    }
  }

  if (fresh.some((signal) => signal.kind === "moisture" && signal.value > 0)) {
    return { bringForwardDays: 90, reason: "Moisture detected where there should be none." };
  }

  return { bringForwardDays: 0, reason: "Nothing in the readings suggests a problem." };
}
