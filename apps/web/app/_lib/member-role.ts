/**
 * The same label wherever a member's role is shown, not one phrasing per page.
 *
 * The household still has exactly one owner internally (who alone can
 * designate other Admins, and who cannot be removed) — but the product no
 * longer surfaces that as a separate "Head of Family" tier. Owner, head and
 * administrator all read as "Admin".
 */
export function describeRoles(roles: readonly string[], isOwner: boolean): string {
  if (isOwner || roles.includes("head") || roles.includes("administrator")) return "Admin";
  if (roles.includes("helper")) return "Househelper";
  if (roles.includes("child")) return "Child";
  return "Adult";
}
