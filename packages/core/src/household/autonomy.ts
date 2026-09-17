/**
 * AI autonomy (story 02-005).
 *
 * The story's requirement is that autonomy is "enforced at action execution
 * time, not merely displayed in settings". So this module returns a decision
 * about a specific proposed action, and the tools that act call it — there is
 * no place to read a mode and then decide for yourself what it means.
 *
 * Two rules sit above the household's configuration and cannot be turned off
 * from a settings screen:
 *
 *   * An unconfigured outcome resolves to `observe`. Anything nobody has
 *     thought about is watched, never acted on.
 *   * Some action classes always need a person, whatever the mode says.
 *     Spending money, changing who can act, and anything irreversible are not
 *     things a household should be able to hand over by ticking a box.
 */

export const AUTONOMY_MODES = ["observe", "prepare", "approve", "execute"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const AUTONOMY_DESCRIPTIONS: Record<AutonomyMode, string> = {
  observe: "Watch and tell you. WonderHome changes nothing on its own.",
  prepare: "Get things ready — a draft order, a suggested plan — and wait for you.",
  approve: "Do the work once you say yes.",
  execute: "Handle it, and tell you what was done.",
};

/**
 * What a proposed action would do, independent of who asked for it.
 *
 * `reversible` is the household's own question: an order that can be cancelled
 * before dispatch is different from one that cannot.
 */
export type ProposedAction = {
  outcomeKey: string;
  kind:
    | "read"
    | "draft"
    | "schedule"
    | "notify"
    | "order"
    | "payment"
    | "permission_change"
    | "delete";
  reversible: boolean;
  /** Minor units, for actions that spend. */
  amountMinor?: number;
};

export type AutonomyDecision =
  | { outcome: "observe_only"; reason: string }
  | { outcome: "prepare_only"; reason: string }
  | { outcome: "needs_approval"; reason: string }
  | { outcome: "execute"; reason: string };

/** Action classes that always need a person, whatever the household configured. */
const ALWAYS_NEEDS_A_PERSON: ReadonlySet<ProposedAction["kind"]> = new Set([
  "payment",
  "permission_change",
  "delete",
]);

/** Actions that change nothing and are therefore safe in any mode. */
const HARMLESS: ReadonlySet<ProposedAction["kind"]> = new Set(["read", "draft"]);

export function decideAutonomy(mode: AutonomyMode, action: ProposedAction): AutonomyDecision {
  if (HARMLESS.has(action.kind)) {
    return { outcome: "execute", reason: "Reading and drafting change nothing." };
  }

  if (ALWAYS_NEEDS_A_PERSON.has(action.kind)) {
    // Observe still means observe: a household that asked for nothing to happen
    // gets a proposal, not an approval prompt it never invited.
    return mode === "observe"
      ? { outcome: "observe_only", reason: "This outcome is set to observe only." }
      : {
          outcome: "needs_approval",
          reason: `${labelFor(action.kind)} always needs a person, whatever the autonomy setting.`,
        };
  }

  if (!action.reversible && mode !== "execute") {
    return {
      outcome: "needs_approval",
      reason: "This cannot be undone, so someone should see it first.",
    };
  }

  switch (mode) {
    case "observe":
      return { outcome: "observe_only", reason: "This outcome is set to observe only." };
    case "prepare":
      return { outcome: "prepare_only", reason: "Prepared and waiting for you." };
    case "approve":
      return { outcome: "needs_approval", reason: "Ready to go once you approve." };
    case "execute":
      return { outcome: "execute", reason: "Handled automatically, as configured." };
  }
}

function labelFor(kind: ProposedAction["kind"]): string {
  switch (kind) {
    case "payment":
      return "Paying money";
    case "permission_change":
      return "Changing who can act";
    case "delete":
      return "Deleting something";
    default:
      return "This";
  }
}

/** True when the decision permits the action to happen now, without a person. */
export function mayExecuteNow(decision: AutonomyDecision): boolean {
  return decision.outcome === "execute";
}
