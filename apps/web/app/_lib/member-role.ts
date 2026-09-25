import { requestT } from "@wonderhome/core/i18n/request";

/**
 * The same label wherever a member's role is shown, not one phrasing per page.
 *
 * The household still has exactly one owner internally (who alone can
 * designate other Admins, and who cannot be removed) — but the product no
 * longer surfaces that as a separate "Head of Family" tier. Owner, head and
 * administrator all read as "Admin".
 */
export function describeRoles(roles: readonly string[], isOwner: boolean): string {
  // In the viewer's language (story 22-004); English outside a request.
  const t = requestT();
  if (isOwner || roles.includes("head") || roles.includes("administrator")) return t("role.admin");
  if (roles.includes("helper")) return t("role.househelper");
  if (roles.includes("child")) return t("role.child");
  return t("role.adult");
}
