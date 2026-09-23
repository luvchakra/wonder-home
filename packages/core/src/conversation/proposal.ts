import { decideAutonomy, type AutonomyMode, type ProposedAction } from "../household/autonomy";
import { can, type Permission, type PermissionContext } from "../identity/permissions";
import { WHAT_I_CAN_DO, disposeIntent, isConsequential, type HouseholdIntent } from "./intent";
import { linkTo } from "./reply-format";

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
  record_health_appointment: "health.manage",
  log_health_issue: "health.manage",
  resolve_health_issue: "health.manage",
  log_vital: "health.manage",
  set_fitness_goal: "health.manage",
};

/** How an action maps onto the autonomy model's notion of what it does. */
const ACTION_KIND: Record<HouseholdIntent["action"], ProposedAction["kind"]> = {
  record_absence: "schedule",
  add_to_list: "draft",
  ask_status: "read",
  // Always allowed to run: what each proposed step inside the run may
  // actually do is gated per step, by the real tool registry.
  check_agents: "read",
  plan_event: "schedule",
  // A meal on the plan is like an absence: it shapes someone's day, so it
  // follows the meals outcome's own autonomy setting.
  plan_meal: "schedule",
  // A reminder to the speaker themself: nobody else is told anything, and it
  // can be cancelled — as harmless as a note.
  set_reminder: "draft",
  adjust_schedule: "schedule",
  set_preference: "draft",
  make_payment: "payment",
  order_items: "order",
  assign_responsibility: "permission_change",
  record_health_appointment: "schedule",
  log_health_issue: "draft",
  resolve_health_issue: "draft",
  // "draft" is the right autonomy kind for a personal health note: low-stakes,
  // self-directed, reversible — the executor writes it for real, but the
  // autonomy gate stays harmless rather than treating it like a payment.
  log_vital: "draft",
  set_fitness_goal: "draft",
  greet: "read",
  unknown: "read",
};

/** What the assistant says to a hello, a thank-you or "what can you do?". Warm, short, and an invitation. */
export function greetingFor(intent: HouseholdIntent): string {
  switch (intent.parameters.kind) {
    case "thanks":
      return "Any time. I am here whenever the household needs something.";
    case "help":
      return `Here is what I can do today. ${WHAT_I_CAN_DO} Anything that spends money or changes who can act always waits for your OK. The ${linkTo("/help", "user guide")} has the longer version.`;
    default:
      return `Hello! ${WHAT_I_CAN_DO} What would you like?`;
  }
}

export function proposeFromIntent(intent: HouseholdIntent, context: ProposalContext): Proposal {
  // A hello is not a request, and needs no plan, permission or policy.
  if (intent.action === "greet") {
    return { kind: "answer", summary: greetingFor(intent) };
  }

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

/**
 * The grounded value when grounding produced one (Wave 4): the member's
 * name as the household has it, the resolved day with its date — so what a
 * person approves names exactly what will be written, never the raw words.
 */
function groundedName(intent: HouseholdIntent, fallback: string): string {
  return typeof intent.parameters.memberName === "string" ? intent.parameters.memberName : (intent.target.reference ?? fallback);
}

function groundedWhen(intent: HouseholdIntent, key: string): string {
  const resolved = intent.parameters[`${key}Resolved`] as { label?: unknown } | undefined;
  if (resolved && typeof resolved.label === "string") {
    return /^(?:today|tonight|tomorrow|yesterday|this|next)\b/.test(resolved.label) ? resolved.label : `on ${resolved.label}`;
  }
  return String(intent.parameters[key] ?? "");
}

function summarize(intent: HouseholdIntent): string {
  switch (intent.action) {
    case "record_absence":
      return `Record that ${groundedName(intent, "someone")} is away ${groundedWhen(intent, "when")}`.trim();
    case "add_to_list": {
      const items = listItems(intent);
      const what = items.length > 0 ? joinWords(items) : "an item";
      return typeof intent.parameters.forMeal === "string"
        ? `Add what ${intent.parameters.forMeal} needs to the ${intent.target.reference ?? "list"}: ${what}`
        : `Add ${what} to the ${intent.target.reference ?? "list"}`;
    }
    case "plan_meal":
      return `Plan ${String(intent.parameters.mealName ?? intent.parameters.what ?? "a meal")} for ${String(intent.parameters.slot ?? "dinner")} ${groundedWhen(intent, intent.parameters.windowResolved ? "window" : "when")}`.trim();
    case "set_reminder":
      return `Remind you ${groundedWhen(intent, "when")}${typeof intent.parameters.time === "string" ? ` at ${intent.parameters.time}` : ""} to ${String(intent.parameters.what ?? "do that")}`.replace(/\s+/g, " ");
    case "plan_event":
      return `Plan something for ${intent.parameters.windowResolved ? groundedWhen(intent, "window").replace(/^on /, "") : String(intent.parameters.window ?? "the family")}`;
    case "adjust_schedule":
      return `Move ${intent.target.reference ?? "that"} to ${intent.parameters.toResolved ? groundedWhen(intent, "to").replace(/^on /, "") : String(intent.parameters.to ?? "a new time")}`;
    case "set_preference":
      return `Remember that ${intent.utterance.replace(/\.$/, "")}`;
    case "make_payment":
      return `Pay the ${typeof intent.parameters.billLabel === "string" ? intent.parameters.billLabel : (intent.target.reference ?? "bill")}`;
    case "order_items":
      return "Place the order";
    case "assign_responsibility":
      return `Make ${groundedName(intent, "them")} responsible for ${String(intent.parameters.outcomeKey ?? "this")}`;
    case "record_health_appointment":
      return `Book a ${String(intent.parameters.typeText ?? "health")} appointment`;
    case "log_health_issue":
      return `Record ${String(intent.parameters.label ?? "this")}`;
    case "resolve_health_issue":
      return `Mark ${String(intent.parameters.label ?? "this")} resolved`;
    case "log_vital":
      return `Note your ${String(intent.parameters.vital ?? "reading")}`;
    case "set_fitness_goal":
      return `Note the goal: ${String(intent.parameters.activity ?? "this")}`;
    default:
      return intent.utterance;
  }
}

function describeChanges(intent: HouseholdIntent): string[] {
  switch (intent.action) {
    case "plan_meal":
      return ["Put the meal on the household's plan", "Copy its recipe's ingredients onto it, where there is a recipe"];
    case "set_reminder":
      return ["Show you a reminder under Notifications at that time — only you see it"];
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
    case "record_health_appointment":
      return ["Book the appointment for you", "Show it under Health & Fitness"];
    case "log_health_issue":
      return ["Record it under Health & Fitness, private to you unless you choose to share it"];
    case "resolve_health_issue":
      return ["Mark it resolved under Health & Fitness"];
    case "set_fitness_goal":
      return ["Set the goal under Health & Fitness, private to you unless you choose to share it"];
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
    case "record_health_appointment":
    case "log_health_issue":
    case "resolve_health_issue":
    case "log_vital":
    case "set_fitness_goal":
      return "Health & Fitness is for the adults in the household.";
    default:
      return "You do not have access to that.";
  }
}

/** The things an add names: one item or several. */
function listItems(intent: HouseholdIntent): string[] {
  if (Array.isArray(intent.parameters.items)) return intent.parameters.items.filter((value): value is string => typeof value === "string");
  return typeof intent.parameters.item === "string" ? [intent.parameters.item] : [];
}

/** "milk", "milk and bananas", "milk, eggs and bread". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
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
