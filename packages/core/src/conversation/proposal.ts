import { decideAutonomy, type AutonomyMode, type ProposedAction } from "../household/autonomy";
import { can, type Permission, type PermissionContext } from "../identity/permissions";
import { disposeIntent, isConsequential, type HouseholdIntent } from "./intent";

/**
 * From intent to proposal (story 04-004).
 *
 * This is the boundary the whole AI architecture rests on: an intent is what
 * someone asked for, and a proposal is what the system is prepared to do about
 * it. Between the two sit permission, autonomy policy and entitlement — checked
 * deterministically, here, with no reference to what any model concluded.
 *
 * `CLAUDE.md` puts it plainly: an LLM response is never authorization. This
 * module is where that stops being a slogan.
 */

export type ProposalContext = {
  actor: PermissionContext;
  /** Autonomy configured for the outcome this intent touches. */
  autonomy: AutonomyMode;
  /** Whether the household's plan includes the feature the intent needs. */
  entitled: boolean;
};

export type ActionPreview = {
  /** One line the person can check before anything happens. */
  summary: string;
  /** What would change, named plainly. */
  changes: string[];
  /** Why WonderHome thinks this is right. */
  because: string;
  reversible: boolean;
};

export type Proposal =
  | { kind: "clarify"; question: string }
  | { kind: "refused"; reason: string }
  | { kind: "answer"; summary: string }
  | { kind: "prepared"; preview: ActionPreview }
  | { kind: "needs_approval"; preview: ActionPreview }
  | { kind: "executed"; preview: ActionPreview };

/** The permission each action requires. Absent means no special permission. */
const REQUIRED_PERMISSION: Partial<Record<HouseholdIntent["action"], Permission>> = {
  make_payment: "finance.pay",
  assign_responsibility: "responsibilities.manage",
  adjust_schedule: "responsibilities.manage",
  order_items: "finance.view",
};

/** How an action maps onto the autonomy model's notion of what it does. */
const ACTION_KIND: Record<HouseholdIntent["action"], ProposedAction["kind"]> = {
  record_absence: "schedule",
  add_to_list: "draft",
  ask_status: "read",
  plan_event: "schedule",
  adjust_schedule: "schedule",
  set_preference: "draft",
  make_payment: "payment",
  order_items: "order",
  assign_responsibility: "permission_change",
  unknown: "read",
};

export function proposeFromIntent(intent: HouseholdIntent, context: ProposalContext): Proposal {
  const disposition = disposeIntent(intent);
  if (disposition.kind === "clarify") {
    return { kind: "clarify", question: disposition.question };
  }

  // Entitlement before permission: a feature the household does not have is not
  // a permission problem, and saying so is clearer than a refusal that sounds
  // like distrust.
  if (!context.entitled) {
    return {
      kind: "refused",
      reason: "That is not part of your current plan.",
    };
  }

  const required = REQUIRED_PERMISSION[intent.action];
  if (required && !can(context.actor, required)) {
    return { kind: "refused", reason: refusalFor(intent) };
  }

  if (intent.action === "ask_status") {
    return { kind: "answer", summary: `Here is what I know about ${describeTarget(intent)}.` };
  }

  const action: ProposedAction = {
    outcomeKey: intent.target.reference ?? intent.action,
    kind: ACTION_KIND[intent.action],
    reversible: isReversible(intent),
  };

  const decision = decideAutonomy(context.autonomy, action);
  const preview = buildPreview(intent, decision.reason, action.reversible);

  switch (decision.outcome) {
    case "observe_only":
      return {
        kind: "refused",
        reason: "This is set to observe only, so I have not changed anything.",
      };
    case "prepare_only":
      return { kind: "prepared", preview };
    case "needs_approval":
      return { kind: "needs_approval", preview };
    case "execute":
      return { kind: "executed", preview };
  }
}

export function buildPreview(
  intent: HouseholdIntent,
  because: string,
  reversible: boolean,
): ActionPreview {
  return {
    summary: summarize(intent),
    changes: describeChanges(intent),
    because,
    reversible,
  };
}

function summarize(intent: HouseholdIntent): string {
  switch (intent.action) {
    case "record_absence":
      return `Record that ${intent.target.reference ?? "someone"} is away ${String(intent.parameters.when ?? "")}`.trim();
    case "add_to_list":
      return `Add ${String(intent.parameters.item ?? "an item")} to the ${intent.target.reference ?? "list"}`;
    case "plan_event":
      return `Plan something for ${String(intent.parameters.window ?? "the family")}`;
    case "adjust_schedule":
      return `Move ${intent.target.reference ?? "that"} to ${String(intent.parameters.to ?? "a new time")}`;
    case "set_preference":
      return `Remember that ${intent.utterance.replace(/\.$/, "")}`;
    case "make_payment":
      return `Pay the ${intent.target.reference ?? "bill"}`;
    case "order_items":
      return "Place the order";
    case "assign_responsibility":
      return `Make ${intent.target.reference ?? "them"} responsible for ${String(intent.parameters.outcomeKey ?? "this")}`;
    default:
      return intent.utterance;
  }
}

function describeChanges(intent: HouseholdIntent): string[] {
  switch (intent.action) {
    case "record_absence":
      return [
        "Mark them unavailable for that day",
        "Re-check the outcomes they normally handle",
      ];
    case "assign_responsibility":
      return ["Change who owns that outcome", "Notify both people affected"];
    case "adjust_schedule":
      return ["Move the event", "Re-check anything that depended on the old time"];
    case "make_payment":
      return ["Take the payment", "Mark the bill as paid"];
    case "order_items":
      return ["Place the order with the merchant", "Update what the household expects to arrive"];
    default:
      return [summarize(intent)];
  }
}

/** Whether the household could undo this without involving anyone else. */
function isReversible(intent: HouseholdIntent): boolean {
  return intent.action !== "make_payment" && intent.action !== "order_items";
}

function refusalFor(intent: HouseholdIntent): string {
  switch (intent.action) {
    case "make_payment":
      return "You are not set up to make payments for this household.";
    case "assign_responsibility":
      return "Changing who is responsible is up to an administrator.";
    case "adjust_schedule":
      return "Changing the household's schedule is up to an administrator.";
    default:
      return "You do not have access to that.";
  }
}

function describeTarget(intent: HouseholdIntent): string {
  return intent.target.reference ?? "that";
}

/**
 * True when a proposal must be recorded for later approval rather than
 * answered and forgotten. Consequential work always leaves a trace.
 */
export function needsRecording(intent: HouseholdIntent, proposal: Proposal): boolean {
  if (proposal.kind === "clarify" || proposal.kind === "answer") return false;
  return isConsequential(intent.action) || proposal.kind !== "refused";
}
