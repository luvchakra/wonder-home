/**
 * What a househelper does: any number of these, plus one in the household's
 * own words when none fits (rule 20). Kept together on the member as
 * "Maid, Cook", the same in setup and in the profile editor.
 */
export const HELPER_ROLES = ["Maid", "Cook", "Driver", "Nanny", "Gardener", "Caregiver"] as const;

/** "Maid, Cook, Plant care" → the ticked ones and the rest in their own words. */
export function splitHelperRoles(occupation: string | null): { known: string[]; other: string } {
  const said = (occupation ?? "").split(",").map((role) => role.trim()).filter(Boolean);
  return {
    known: said.filter((role) => (HELPER_ROLES as readonly string[]).includes(role)),
    other: said.filter((role) => !(HELPER_ROLES as readonly string[]).includes(role)).join(", "),
  };
}

/** Everything ticked under `key`, plus `${key}_other`, as one "Maid, Cook" (no repeats, at most 100 characters). */
export function helperRolesFrom(formData: FormData, key: string): string | null {
  const said = [...formData.getAll(key), formData.get(`${key}_other`)]
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim().slice(0, 40))
    .filter(Boolean);
  // The first spelling stays: "Cook" ticked, then "cook" typed, is one Cook.
  const unique = said.filter((role, index) => said.findIndex((earlier) => earlier.toLocaleLowerCase() === role.toLocaleLowerCase()) === index);
  return unique.join(", ").slice(0, 100) || null;
}
