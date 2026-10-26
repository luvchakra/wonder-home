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
 *   * An unconfigured outcome resolves to `prepare`. Anything nobody has
 *     thought about waits for a person, never acted on.
 *   * Some action classes always need a person, whatever the mode says.
 *     Spending money, changing who can act, and anything irreversible are not
 *     things a household should be able to hand over by ticking a box.
 */

/**
 * Two modes (the owner, 2026-10-26). There were four, but "approve" and
 * "prepare" were enforced identically and "observe" only refused to prepare
 * anything; migration `20261026090000_two_autonomy_modes` moved both to
 * "prepare".
 */
export const AUTONOMY_MODES = ["prepare", "execute"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

/**
 * A stored mode as the app may use it: "execute" only when it says so,
 * anything else "prepare". Screens read `ai_mode` straight from the table,
 * and an unexpected value must never crash one or act: on 2026-10-26 the
 * Responsibilities page broke for the minutes between the two-mode code
 * going live and the live migration moving "observe" rows to "prepare".
 */
export function asAutonomyMode(value: unknown): AutonomyMode {
  return value === "execute" ? "execute" : "prepare";
}

export const AUTONOMY_DESCRIPTIONS: Record<AutonomyMode, string> = {
  prepare: "Get it ready, and do it once you say yes.",
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
    /** A reversible change to the household's own records — adding to a list. Governed by the outcome's autonomy, unlike a draft. */
    | "change"
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

export type AutonomyDecision = { outcome: "needs_approval"; reason: string } | { outcome: "execute"; reason: string };

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
    return { outcome: "needs_approval", reason: `${labelFor(action.kind)} always needs a person, whatever the autonomy setting.` };
  }

  if (!action.reversible && mode !== "execute") {
    return {
      outcome: "needs_approval",
      reason: "This cannot be undone, so someone should see it first.",
    };
  }

  // Only an explicit "execute" acts. Anything else — "prepare", or a stale or
  // unknown value that reached here without the lookup's cleaning — waits.
  if (mode === "execute") return { outcome: "execute", reason: "Handled automatically, as configured." };
  return { outcome: "needs_approval", reason: "Ready to go once you approve." };
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
