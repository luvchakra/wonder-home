import type { AgeBand } from "./age";
import type { HouseholdMembership } from "./schemas";
import { can, permissionsFor, type Permission } from "./permissions";

/**
 * Personalized views (story 01-005).
 *
 * One household, many views. The same records produce a different view per
 * member according to role, responsibility and privacy scope — and the
 * filtering happens here, on the server, before anything is sent. The UI spec
 * is explicit that personalized views are permission-filtered from the API and
 * not merely hidden with CSS, so a section a member may not see is absent from
 * the payload rather than styled away.
 */

export type ViewSection = {
  key: string;
  label: string;
  href: string;
  /** Why this section is here, used for empty states and accessibility. */
  purpose: string;
};

/** Every section the product can show, with the permission that unlocks it. */
const SECTIONS: readonly (ViewSection & { requires: Permission | null })[] = [
  {
    key: "school",
    label: "School",
    href: "/school",
    purpose: "Homework, worksheets and exams",
    requires: "school.view_own",
  },
  {
    key: "school_all",
    label: "School (household)",
    href: "/school",
    purpose: "Every child's school work",
    requires: "school.manage",
  },
  {
    key: "bills",
    label: "Bills & finance",
    href: "/bills",
    purpose: "Upcoming bills and spending",
    requires: "finance.view",
  },
  {
    key: "responsibilities",
    label: "Responsibilities",
    href: "/household/responsibilities",
    purpose: "Who handles what",
    requires: "responsibilities.manage",
  },
  {
    key: "members",
    label: "Members & roles",
    href: "/household/members",
    purpose: "Who is in the household",
    requires: "members.manage",
  },
  {
    key: "manage",
    label: "Manage Household",
    href: "/household",
    purpose: "Playbook, policies and AI autonomy",
    requires: "household.manage",
  },
  {
    key: "integrations",
    label: "Integrations",
    href: "/household/integrations",
    purpose: "Connected accounts",
    requires: "integrations.manage",
  },
  {
    key: "family_time",
    label: "Family time",
    href: "/family",
    purpose: "Shared plans and moments",
    requires: null,
  },
];

export type PersonalView = {
  memberId: string;
  displayName: string;
  householdName: string;
  roleLabel: string;
  ageBand: AgeBand | null;
  permissions: Permission[];
  sections: ViewSection[];
  /** A child's view is framed differently, not just reduced. */
  tone: "adult" | "child" | "helper";
};

export function roleLabelFor(membership: HouseholdMembership): string {
  if (membership.roles.includes("head") || membership.roles.includes("administrator")) return "Admin";
  if (membership.memberType === "child") return "Child";
  if (membership.memberType === "helper") return "Househelper";
  return "Adult";
}

export function buildPersonalView(
  membership: HouseholdMembership,
  ageBand: AgeBand | null = null,
): PersonalView {
  const context = { roles: membership.roles, memberType: membership.memberType };
  const permissions = [...permissionsFor(context)].sort();

  const sections = SECTIONS.filter(
    (section) => section.requires === null || can(context, section.requires),
  )
    // "School" and "School (household)" are the same destination seen from two
    // vantage points; an adult who manages school work should not see both.
    .filter((section) => !(section.key === "school" && can(context, "school.manage")))
    .map(({ requires: _requires, ...section }) => section);

  return {
    memberId: membership.memberId,
    displayName: membership.displayName,
    householdName: membership.household.name,
    roleLabel: roleLabelFor(membership),
    ageBand,
    permissions,
    sections,
    tone:
      membership.memberType === "child"
        ? "child"
        : membership.memberType === "helper"
          ? "helper"
          : "adult",
  };
}
