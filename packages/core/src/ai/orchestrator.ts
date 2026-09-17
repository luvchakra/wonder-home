import type { AutonomyMode } from "../household/autonomy";
import type { PermissionContext } from "../identity/permissions";
import { authorizeToolCall, type ToolAuthorization } from "./tools";

/**
 * The household orchestrator (stories 14-001, 14-003, 14-004, 14-006).
 *
 * The loop the backlog names — observe, understand, plan, act, monitor, learn —
 * expressed as explicit state so that every transition is recordable and a run
 * can be explained after the fact.
 *
 * The orchestrator coordinates; it does not decide. Whether a step may happen
 * is answered by `authorizeToolCall`, and the model's output is an input to
 * that question rather than an answer to it.
 */

export const RUN_PHASES = [
  "observe",
  "understand",
  "plan",
  "act",
  "monitor",
  "learn",
  "done",
] as const;
export type RunPhase = (typeof RUN_PHASES)[number];

export type RunStatus = "running" | "waiting_for_approval" | "succeeded" | "failed" | "abandoned";

export type PlannedStep = {
  toolName: string;
  /** Why the plan includes this step, in the household's terms. */
  rationale: string;
  arguments: Record<string, unknown>;
};

export type AgentRun = {
  id: string;
  householdId: string;
  phase: RunPhase;
  status: RunStatus;
  steps: PlannedStep[];
  completedSteps: number;
  /** Safe summary only — never raw prompts or household content. */
  summary: string;
};

export type StepOutcome =
  | { kind: "executed"; toolName: string }
  | { kind: "awaiting_approval"; toolName: string; reason: string }
  | { kind: "refused"; toolName: string; reason: string };

export type StepContext = {
  actor: PermissionContext;
  actorHouseholdId: string;
  autonomy: (toolName: string) => AutonomyMode;
  entitled: (toolName: string) => boolean;
};

/**
 * Runs one planned step through the gate.
 *
 * Nothing here trusts the plan. A step naming a household the actor does not
 * belong to, or a tool they may not use, is refused at this point rather than
 * having been prevented earlier — because "prevented earlier" is an assumption
 * and this is a check.
 */
export function executeStep(
  step: PlannedStep,
  run: AgentRun,
  context: StepContext,
): { outcome: StepOutcome; authorization: ToolAuthorization } {
  const authorization = authorizeToolCall(step.toolName, {
    actor: context.actor,
    actorHouseholdId: context.actorHouseholdId,
    targetHouseholdId: run.householdId,
    autonomy: context.autonomy(step.toolName),
    entitled: context.entitled(step.toolName),
  });

  if (!authorization.allowed) {
    return {
      outcome: { kind: "refused", toolName: step.toolName, reason: authorization.reason },
      authorization,
    };
  }

  if (authorization.requiresApproval) {
    return {
      outcome: {
        kind: "awaiting_approval",
        toolName: step.toolName,
        reason: authorization.reason,
      },
      authorization,
    };
  }

  return { outcome: { kind: "executed", toolName: step.toolName }, authorization };
}

/**
 * Advances a run given what the last step did.
 *
 * A run that hits an approval stops rather than skipping ahead to the next
 * step: the steps after it were planned assuming it happened, so continuing
 * would act on a premise nobody agreed to.
 */
export function advance(run: AgentRun, outcome: StepOutcome): AgentRun {
  switch (outcome.kind) {
    case "executed": {
      const completedSteps = run.completedSteps + 1;
      const finished = completedSteps >= run.steps.length;
      return {
        ...run,
        completedSteps,
        phase: finished ? "monitor" : "act",
        status: "running",
        summary: finished ? "All planned steps completed." : `${completedSteps} steps done.`,
      };
    }
    case "awaiting_approval":
      return {
        ...run,
        status: "waiting_for_approval",
        summary: `Waiting for someone to approve ${outcome.toolName}.`,
      };
    case "refused":
      return {
        ...run,
        status: "failed",
        phase: "done",
        summary: `Stopped: ${outcome.reason}`,
      };
  }
}

/** The phase order, used to reject a run that tries to skip understanding. */
export function nextPhase(phase: RunPhase): RunPhase {
  const index = RUN_PHASES.indexOf(phase);
  return RUN_PHASES[Math.min(index + 1, RUN_PHASES.length - 1)] as RunPhase;
}

export function isValidTransition(from: RunPhase, to: RunPhase): boolean {
  // Forward by one, or straight to done — a run may give up at any point, but
  // it may not jump from observing to acting without planning in between.
  if (to === "done") return true;
  return RUN_PHASES.indexOf(to) === RUN_PHASES.indexOf(from) + 1;
}

/**
 * What an approval actually approves (story 14-005).
 *
 * The approval binds to the exact step. A person approving "pay the electricity
 * bill for ₹2,840" has not approved paying a different bill, or the same bill
 * for a different amount — so the recorded fingerprint is compared before the
 * step runs, and a mismatch is a refusal rather than a re-prompt.
 */
export function approvalFingerprint(step: PlannedStep): string {
  const argumentKeys = Object.keys(step.arguments).sort();
  const normalized = argumentKeys.map((key) => `${key}=${stringify(step.arguments[key])}`);
  return `${step.toolName}(${normalized.join(",")})`;
}

export function approvalMatches(approvedFingerprint: string, step: PlannedStep): boolean {
  return approvedFingerprint === approvalFingerprint(step);
}

function stringify(value: unknown): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

/**
 * Learning boundaries (story 14-006).
 *
 * A run may propose what it noticed, but it never writes a confirmed fact. The
 * distinction between "we observed this" and "the household told us this" is
 * the one thing certification depends on, and an agent allowed to blur it would
 * make the whole trust model decorative.
 */
export type LearningProposal = {
  key: string;
  value: unknown;
  /** Always 'observed' from a run: an agent cannot claim it was told something. */
  sourceType: "observed";
  confidence: number;
  status: "learned";
};

export function proposeLearning(input: {
  key: string;
  value: unknown;
  confidence: number;
}): LearningProposal {
  return {
    key: input.key,
    value: input.value,
    sourceType: "observed",
    // Capped: an agent is never more than fairly sure about a pattern, because
    // certainty is what a person confirming it provides.
    confidence: Math.min(0.8, Math.max(0, input.confidence)),
    status: "learned",
  };
}
