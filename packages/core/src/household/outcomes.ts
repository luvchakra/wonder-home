/**
 * The outcome engine (stories 03-001, 03-003, 03-004, 03-005).
 *
 * An outcome is a desired household result — "everyone has clean clothes ready
 * for the week" — with an owner, a window and a way of being verified. It is not
 * a task. Nobody ticks these off to keep the system accurate, which is the
 * difference between this product and a shared to-do list.
 *
 * Evaluation is a pure function of the outcome and the time, so it can be run
 * anywhere, tested exhaustively, and produce the same answer in a worker as in a
 * request. Anything that decides to *interrupt someone* lives in module 06;
 * this module only decides what is true.
 */

export const OUTCOME_STATUSES = [
  "pending",
  "on_track",
  "at_risk",
  "blocked",
  "met",
  "missed",
  "cancelled",
] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const RISK_LEVELS = ["none", "low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type VerificationSource = "observed" | "integration" | "member_confirmed" | "inferred";

export type Outcome = {
  id: string;
  outcomeKey: string;
  status: OutcomeStatus;
  riskLevel: RiskLevel;
  ownerMemberId: string | null;
  windowStart: Date | null;
  dueAt: Date | null;
  verifiedAt: Date | null;
  verificationSource: VerificationSource | null;
  /** Upstream outcomes that must be met first. */
  dependencies?: { outcomeKey: string; status: OutcomeStatus }[];
  /** Set when something external is known to be preventing progress. */
  blockedReason?: string | null;
};

export type Evaluation = {
  status: OutcomeStatus;
  riskLevel: RiskLevel;
  /** True only when the evaluation changed something. */
  changed: boolean;
  /**
   * Whether this evaluation is worth anybody's attention. Normal operation is
   * silent: an outcome that is simply on track produces nothing.
   */
  notable: boolean;
  reason: string;
};

/**
 * How close to the deadline an unmet outcome starts being a worry, as a
 * fraction of its window. Before this it is simply in progress.
 */
export const AT_RISK_THRESHOLD = 0.75;

export function evaluateOutcome(outcome: Outcome, now: Date = new Date()): Evaluation {
  const settle = (status: OutcomeStatus, riskLevel: RiskLevel, reason: string): Evaluation => {
    const changed = status !== outcome.status || riskLevel !== outcome.riskLevel;
    return {
      status,
      riskLevel,
      changed,
      // On track and met are the normal cases, and normal is silent.
      notable: changed && status !== "on_track" && status !== "met",
      reason,
    };
  };

  if (outcome.status === "cancelled") {
    return settle("cancelled", "none", "This outcome was cancelled.");
  }

  if (outcome.verifiedAt) {
    return settle("met", "none", "Verified as done.");
  }

  const failedDependency = (outcome.dependencies ?? []).find(
    (dependency) => dependency.status === "missed" || dependency.status === "blocked",
  );
  if (failedDependency) {
    return settle(
      "blocked",
      "high",
      `Waiting on ${failedDependency.outcomeKey}, which is ${failedDependency.status}.`,
    );
  }

  if (outcome.blockedReason) {
    return settle("blocked", "high", outcome.blockedReason);
  }

  const unmetDependency = (outcome.dependencies ?? []).find(
    (dependency) => dependency.status !== "met",
  );

  if (!outcome.dueAt) {
    // No deadline means nothing can be late; it is simply in progress.
    return settle(
      unmetDependency ? "pending" : "on_track",
      "none",
      unmetDependency ? `Waiting on ${unmetDependency.outcomeKey}.` : "In progress.",
    );
  }

  if (now >= outcome.dueAt) {
    return settle("missed", "high", "The deadline passed without this being done.");
  }

  const elapsed = progressThroughWindow(outcome, now);

  if (elapsed >= AT_RISK_THRESHOLD) {
    const riskLevel: RiskLevel = elapsed >= 0.9 ? "high" : "medium";
    return settle(
      "at_risk",
      riskLevel,
      unmetDependency
        ? `Due soon and still waiting on ${unmetDependency.outcomeKey}.`
        : "Due soon and not done yet.",
    );
  }

  if (unmetDependency) {
    return settle("pending", "low", `Waiting on ${unmetDependency.outcomeKey}.`);
  }

  return settle("on_track", "none", "On track.");
}

/** How far through its window an outcome is, from 0 to 1. */
export function progressThroughWindow(outcome: Outcome, now: Date): number {
  if (!outcome.dueAt) return 0;

  const start = outcome.windowStart ?? null;
  if (!start) {
    // With no window, "due soon" means within the last six hours before the
    // deadline — enough to act, not so much that it nags all day.
    const hoursLeft = (outcome.dueAt.getTime() - now.getTime()) / 3_600_000;
    return hoursLeft <= 0 ? 1 : Math.max(0, 1 - hoursLeft / 6);
  }

  const span = outcome.dueAt.getTime() - start.getTime();
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / span));
}

export type DetectedException = {
  kind: "late" | "at_risk" | "blocked" | "dependency_failed" | "no_owner";
  impact: string;
  recommendedAction: { action: string; target?: string };
};

/**
 * Turns an evaluation into an exception, if it is one.
 *
 * Every exception carries an impact and a recommended action, because an
 * exception with neither is just an observation, and the notification engine
 * has nothing to offer a person about it.
 */
export function detectException(
  outcome: Outcome,
  evaluation: Evaluation,
): DetectedException | null {
  if (!outcome.ownerMemberId && evaluation.status !== "met" && evaluation.status !== "cancelled") {
    return {
      kind: "no_owner",
      impact: `Nobody is responsible for ${outcome.outcomeKey}, so it will not happen by itself.`,
      recommendedAction: { action: "assign_owner", target: outcome.outcomeKey },
    };
  }

  switch (evaluation.status) {
    case "missed":
      return {
        kind: "late",
        impact: `${outcome.outcomeKey} did not happen in time.`,
        recommendedAction: { action: "replan", target: outcome.outcomeKey },
      };
    case "blocked": {
      const failed = (outcome.dependencies ?? []).find(
        (dependency) => dependency.status === "missed" || dependency.status === "blocked",
      );
      return failed
        ? {
            kind: "dependency_failed",
            impact: `${outcome.outcomeKey} cannot proceed until ${failed.outcomeKey} is resolved.`,
            recommendedAction: { action: "resolve_dependency", target: failed.outcomeKey },
          }
        : {
            kind: "blocked",
            impact: evaluation.reason,
            recommendedAction: { action: "unblock", target: outcome.outcomeKey },
          };
    }
    case "at_risk":
      return {
        kind: "at_risk",
        impact: `${outcome.outcomeKey} is unlikely to happen in time without a change.`,
        recommendedAction: { action: "replan", target: outcome.outcomeKey },
      };
    default:
      // On track, met, pending and cancelled are not exceptions. Silence.
      return null;
  }
}

/** An outcome and what it waits for — the same shape `configuration.ts`'s own dependency graph already uses. */
export type DependencyEdge = { itemKey: string; dependsOnKey: string };

/**
 * Connects upstream and downstream outcomes (story 03-006).
 *
 * `evaluateOutcome`, `detectException` and `planReplan` above all already
 * consume an outcome's `dependencies` — the graph itself was never the gap.
 * What was missing is turning a household's actual dependency edges (the
 * same ones `configuration.ts`'s `canDependOn` already validates, set once
 * in the playbook) into that field, carrying each upstream outcome's
 * *current* status rather than just its key. Building the graph here from
 * the same edges the playbook validates means there is one dependency
 * graph a household sets, not two that could quietly disagree — a cycle is
 * already refused where the edge is created, so this never needs to check
 * for one again.
 *
 * An upstream outcome with no live instance yet (its routine has not fired
 * this cycle) is treated as `"pending"` — not yet met, which is the honest
 * reading of "nothing is known to have happened."
 */
export function attachDependencies(
  outcomes: readonly Omit<Outcome, "dependencies">[],
  edges: readonly DependencyEdge[],
): Outcome[] {
  const statusByKey = new Map(outcomes.map((outcome) => [outcome.outcomeKey, outcome.status]));

  const dependsOnByKey = new Map<string, string[]>();
  for (const edge of edges) {
    dependsOnByKey.set(edge.itemKey, [...(dependsOnByKey.get(edge.itemKey) ?? []), edge.dependsOnKey]);
  }

  return outcomes.map((outcome) => ({
    ...outcome,
    dependencies: (dependsOnByKey.get(outcome.outcomeKey) ?? []).map((dependsOnKey) => ({
      outcomeKey: dependsOnKey,
      status: statusByKey.get(dependsOnKey) ?? "pending",
    })),
  }));
}

export type ReplanInput = {
  outcomes: Outcome[];
  /** Outcome keys whose circumstances changed — a dependency, an absence. */
  changedKeys: string[];
};

export type ReplanResult = {
  affected: Outcome[];
  untouched: Outcome[];
};

/**
 * Works out which outcomes a change actually reaches (story 03-005).
 *
 * Replanning has to preserve unaffected plans: a household whose whole schedule
 * shuffles because one thing moved has been given a worse problem than the one
 * it started with. Reachability is computed through the dependency graph rather
 * than assumed, so only genuinely downstream outcomes are touched.
 */
export function planReplan({ outcomes, changedKeys }: ReplanInput): ReplanResult {
  const reached = new Set(changedKeys);
  let grew = true;

  while (grew) {
    grew = false;
    for (const outcome of outcomes) {
      if (reached.has(outcome.outcomeKey)) continue;
      const dependsOnReached = (outcome.dependencies ?? []).some((dependency) =>
        reached.has(dependency.outcomeKey),
      );
      if (dependsOnReached) {
        reached.add(outcome.outcomeKey);
        grew = true;
      }
    }
  }

  return {
    affected: outcomes.filter((outcome) => reached.has(outcome.outcomeKey)),
    untouched: outcomes.filter((outcome) => !reached.has(outcome.outcomeKey)),
  };
}
