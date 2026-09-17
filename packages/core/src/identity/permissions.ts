import type { HouseholdRole, MemberType } from "./schemas";

/**
 * Permissions (story 01-003).
 *
 * Roles are what people are called; permissions are what the server actually
 * checks. Keeping them separate means a screen can ask "may this person do
 * this?" without hard-coding a role list that then has to be kept in step
 * everywhere.
 *
 * Defaults are deny. A child or a helper inherits nothing from the adults in
 * the household — finances, private conversations and administration have to be
 * granted explicitly, and the catalogue below is the only place that says so.
 */

export const PERMISSIONS = {
  "household.manage": "Change household settings, playbook, policies and AI autonomy",
  "members.manage": "Invite, remove and edit members",
  "members.assign_admin": "Designate or remove Household Administrators",
  "responsibilities.manage": "Assign who is responsible for what",
  "finance.view": "See bills, budgets and spending",
  "finance.pay": "Approve and make payments",
  "school.view_own": "See one's own school work",
  "school.manage": "See and manage every child's school work",
  "conversation.private": "Hold conversations not visible to other members",
  "integrations.manage": "Connect and disconnect external accounts",
  "audit.view": "Read the household audit trail",
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * What each role may do by default.
 *
 * Head and Administrator differ in exactly one thing — only the head may change
 * who administers the household — which is the same line the RLS policy draws.
 */
const ROLE_DEFAULTS: Record<HouseholdRole, readonly Permission[]> = {
  head: [
    "household.manage",
    "members.manage",
    "members.assign_admin",
    "responsibilities.manage",
    "finance.view",
    "finance.pay",
    "school.manage",
    "conversation.private",
    "integrations.manage",
    "audit.view",
  ],
  administrator: [
    "household.manage",
    "members.manage",
    "responsibilities.manage",
    "finance.view",
    "finance.pay",
    "school.manage",
    "conversation.private",
    "integrations.manage",
    "audit.view",
  ],
  adult: ["finance.view", "school.manage", "conversation.private"],
  // A child sees their own school work and nothing of the household's money,
  // administration or other people's private conversations.
  child: ["school.view_own"],
  // A helper's access is limited to what their work requires; module 07 adds
  // the operational permissions they actually need.
  helper: [],
};

export type PermissionContext = {
  roles: readonly HouseholdRole[];
  memberType?: MemberType;
  /** Explicit grants recorded against the member, beyond their role defaults. */
  extraGrants?: readonly Permission[];
};

/** Everything this member may do, role defaults plus explicit grants. */
export function permissionsFor(context: PermissionContext): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of context.roles) {
    for (const permission of ROLE_DEFAULTS[role] ?? []) granted.add(permission);
  }
  for (const permission of context.extraGrants ?? []) granted.add(permission);
  return granted;
}

export function can(context: PermissionContext, permission: Permission): boolean {
  return permissionsFor(context).has(permission);
}

/**
 * Whether `actor` may grant or revoke `role` on someone else.
 *
 * Only the head may create or remove administrators, so an administrator cannot
 * promote themselves or a confederate. The RLS policy enforces the same rule;
 * this is the application-side check that is authoritative.
 */
export function canAssignRole(actor: PermissionContext, role: HouseholdRole): boolean {
  if (role === "head") return false; // Ownership transfer is its own operation.
  if (role === "administrator") return can(actor, "members.assign_admin");
  return can(actor, "members.manage");
}
