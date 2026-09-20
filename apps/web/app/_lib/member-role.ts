/** The same label wherever a member's role is shown, not one phrasing per page. */
export function describeRoles(roles: readonly string[], isOwner: boolean): string {
  if (isOwner || roles.includes("head")) return "Head of Family";
  if (roles.includes("administrator")) return "Household Administrator";
  if (roles.includes("helper")) return "Househelper";
  if (roles.includes("child")) return "Child";
  return "Adult";
}
