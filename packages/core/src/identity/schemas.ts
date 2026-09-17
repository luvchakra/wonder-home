import { z } from "zod";

/**
 * Shared identity contracts (story 01-001).
 *
 * One schema per concept, used by the API route, the domain service and the
 * client form alike — so validation cannot drift between the surface a person
 * sees and the rule the server actually enforces.
 */

const trimmedName = z
  .string()
  .trim()
  .min(1, { error: "is required" })
  .max(80, { error: "must be 80 characters or fewer" });

/**
 * IANA zone. Validated against the runtime's own tz database rather than a
 * hand-kept list, so it stays correct as zones change.
 */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { error: "must be a valid IANA time zone, e.g. Asia/Kolkata" },
  );

export const createHouseholdSchema = z.object({
  householdName: trimmedName,
  displayName: trimmedName,
  timezone: timezoneSchema.default("Asia/Kolkata"),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const MEMBER_TYPES = ["adult", "child", "helper"] as const;
export const HOUSEHOLD_ROLES = ["head", "administrator", "adult", "child", "helper"] as const;

export type MemberType = (typeof MEMBER_TYPES)[number];
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export type Household = {
  id: string;
  name: string;
  timezone: string;
  status: "active" | "suspended" | "closed";
  ownerMemberId: string | null;
};

export type HouseholdMembership = {
  household: Household;
  memberId: string;
  displayName: string;
  memberType: MemberType;
  /** ISO date, when known. Drives the age band; never stored as an age. */
  dateOfBirth?: string | null;
  roles: HouseholdRole[];
};
