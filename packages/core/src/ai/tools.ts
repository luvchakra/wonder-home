import { decideAutonomy, type AutonomyMode, type ProposedAction } from "../household/autonomy";
import { can, type Permission, type PermissionContext } from "../identity/permissions";

/**
 * Governed tools (stories 14-002, 14-005).
 *
 * `CLAUDE.md` states that AI agents never directly mutate the database — they
 * call governed domain tools. This module is that gate, and it is deliberately
 * the only way through: a tool is not a function an agent may call, it is a
 * declaration of what would have to be true for a call to be allowed.
 *
 * Every invocation independently re-checks identity, household scope, role,
 * entitlement and autonomy policy. "Independently" is the point: an agent that
 * has already passed one check does not carry that permission to the next call,
 * because a plan is not a credential.
 */

export type ToolRisk = "safe" | "changes_household" | "spends_money" | "changes_access";

export type ToolDefinition = {
  name: string;
  description: string;
  /** What a caller must hold. Absent means any member may call it. */
  requires: Permission | null;
  /** How this maps onto the autonomy model. */
  actionKind: ProposedAction["kind"];
  risk: ToolRisk;
  /** Whether the household could undo the result without anyone else. */
  reversible: boolean;
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "outcomes.read",
    description: "Look at the household's outcomes and their state",
    requires: null,
    actionKind: "read",
    risk: "safe",
    reversible: true,
  },
  {
    name: "outcomes.replan",
    description: "Move an outcome's window when circumstances changed",
    requires: "responsibilities.manage",
    actionKind: "schedule",
    risk: "changes_household",
    reversible: true,
  },
  {
    name: "list.add_item",
    description: "Add something to a household list",
    requires: null,
    // Not a draft: the executor really writes a grocery item, so it answers
    // to the household's autonomy setting like any other change — observe
    // means it does not happen, approve means a person says yes first.
    actionKind: "change",
    risk: "safe",
    reversible: true,
  },
  {
    name: "availability.record_absence",
    description: "Record that someone will be away",
    requires: null,
    actionKind: "schedule",
    risk: "changes_household",
    reversible: true,
  },
  {
    name: "home.read_agenda",
    description: "Look at what maintenance, laundry and pet care currently need",
    requires: null,
    actionKind: "read",
    risk: "safe",
    reversible: true,
  },
  {
    name: "home.raise_service_request",
    description: "Raise a service request for something in the house",
    requires: null,
    actionKind: "draft",
    risk: "changes_household",
    reversible: true,
  },
  {
    name: "home.book_service",
    description: "Book a technician for an asset that is due or has failed",
    requires: "responsibilities.manage",
    actionKind: "schedule",
    risk: "changes_household",
    reversible: true,
  },
  {
    name: "commerce.place_order",
    description: "Place an order with a merchant",
    requires: "finance.view",
    actionKind: "order",
    risk: "spends_money",
    reversible: false,
  },
  {
    name: "bills.pay",
    description: "Pay a bill the household owes",
    requires: "finance.pay",
    actionKind: "payment",
    risk: "spends_money",
    reversible: false,
  },
  {
    name: "health.notify_overdue",
    description: "Tell a household member about an overdue health item",
    requires: "health.manage",
    actionKind: "notify",
    risk: "safe",
    reversible: true,
  },
  {
    name: "members.set_role",
    description: "Change what someone in the household may do",
    requires: "members.assign_admin",
    actionKind: "permission_change",
    risk: "changes_access",
    reversible: true,
  },
] as const;

export function findTool(name: string): ToolDefinition | null {
  return TOOLS.find((tool) => tool.name === name) ?? null;
}

export type ToolCallContext = {
  /** Resolved from the session, never from anything the model produced. */
  actor: PermissionContext;
  actorHouseholdId: string;
  /** The household the call names, which may not be the actor's. */
  targetHouseholdId: string;
  autonomy: AutonomyMode;
  entitled: boolean;
};

export type ToolAuthorization =
  | { allowed: false; code: ToolRefusalCode; reason: string }
  | { allowed: true; requiresApproval: boolean; reason: string };

export type ToolRefusalCode =
  | "unknown_tool"
  | "cross_household"
  | "not_entitled"
  | "missing_permission"
  | "autonomy_forbids";

/**
 * Decides whether one tool call may proceed.
 *
 * The order matters. Scope is checked before permission, because a call
 * reaching into another household is not a permissions question and answering
 * it as one leaks whether that household exists.
 */
export function authorizeToolCall(toolName: string, context: ToolCallContext): ToolAuthorization {
  const tool = findTool(toolName);
  if (!tool) {
    return { allowed: false, code: "unknown_tool", reason: "No such tool." };
  }

  if (context.actorHouseholdId !== context.targetHouseholdId) {
    return {
      allowed: false,
      code: "cross_household",
      reason: "That is not this household.",
    };
  }

  if (!context.entitled) {
    return {
      allowed: false,
      code: "not_entitled",
      reason: "That is not part of this household's plan.",
    };
  }

  if (tool.requires && !can(context.actor, tool.requires)) {
    return {
      allowed: false,
      code: "missing_permission",
      reason: `${tool.description} is not something this member may do.`,
    };
  }

  const decision = decideAutonomy(context.autonomy, {
    outcomeKey: toolName,
    kind: tool.actionKind,
    reversible: tool.reversible,
  });

  switch (decision.outcome) {
    case "observe_only":
      return { allowed: false, code: "autonomy_forbids", reason: decision.reason };
    case "prepare_only":
    case "needs_approval":
      return { allowed: true, requiresApproval: true, reason: decision.reason };
    case "execute":
      return { allowed: true, requiresApproval: false, reason: decision.reason };
  }
}

/**
 * The tools an agent may be offered, given who is asking.
 *
 * Offering a tool the caller could never use wastes a turn and invites the
 * model to argue about it. This narrows the surface before the model sees it —
 * while `authorizeToolCall` still re-checks every call, because a filtered list
 * is a convenience and never the control.
 */
export function toolsAvailableTo(context: Omit<ToolCallContext, "targetHouseholdId">): ToolDefinition[] {
  return TOOLS.filter((tool) => {
    if (tool.requires && !can(context.actor, tool.requires)) return false;
    if (!context.entitled && tool.risk !== "safe") return false;
    return true;
  });
}
