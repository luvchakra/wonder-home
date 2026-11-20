import type { HouseholdMembership } from "../identity/schemas";

/**
 * Who may reset a home, and from where (story 15-014).
 *
 * The owner asked for "reset home" in Settings (2026-11-20): every member but
 * the owner removed and every record of the home deleted, behind a Danger zone.
 * The default here, which the owner can change: **only the household's owner**
 * (the one person who always stays Admin, `households.owner_member_id`) may do
 * it — not another Admin, never a child or a helper — and **only on the Reset
 * home screen in the app**. Never by voice, never from HomeTalk or WhatsApp,
 * never by an agent: there is no intent and no tool for it, and
 * `reset-policy.test.ts` fails if one appears.
 *
 * This is the screen's and the server action's check. The database function
 * (`public.reset_household`) checks the owner again, itself, and only the
 * service role may call it; the server calls it only after a fresh step-up.
 */

/** Where a request can come from. Only `app` is ever allowed to reset. */
export const RESET_CHANNELS = ["app", "hometalk", "voice", "whatsapp", "agent"] as const;
export type ResetChannel = (typeof RESET_CHANNELS)[number];

export type ResetRefusal = "not_owner" | "not_adult" | "not_in_app";

export type ResetDecision = { ok: true } | { ok: false; code: ResetRefusal };

type Who = Pick<HouseholdMembership, "memberId" | "memberType" | "roles"> & {
  household: Pick<HouseholdMembership["household"], "id" | "ownerMemberId">;
};

/** Pure: whether this member, on this channel, may reset this household. */
export function mayResetHome(who: Who, channel: ResetChannel, householdId: string = who.household.id): ResetDecision {
  if (channel !== "app") return { ok: false, code: "not_in_app" };
  if (who.household.id !== householdId) return { ok: false, code: "not_owner" };
  if (who.memberType !== "adult") return { ok: false, code: "not_adult" };
  if (!who.household.ownerMemberId || who.household.ownerMemberId !== who.memberId) return { ok: false, code: "not_owner" };
  return { ok: true };
}

export type DownloadDecision = { ok: true } | { ok: false; code: "child" | "not_in_app" | "other_household" };

/**
 * Who may download their own copy (owner, 2026-11-20: "everyone should have
 * similar option to download the data"). Every adult, Admin or not, and a
 * househelper (who has Settings too); never a child, whose guardian's and
 * Admins' downloads already hold what they can see of the child. Only in the
 * app: never by voice, HomeTalk, WhatsApp or an agent. What the file holds is
 * decided elsewhere, by the person's own session and RLS: exactly what they
 * can already see.
 */
export function mayDownloadOwnData(
  who: Pick<HouseholdMembership, "memberType"> & { household: Pick<HouseholdMembership["household"], "id"> },
  channel: ResetChannel,
  householdId: string = who.household.id,
): DownloadDecision {
  if (channel !== "app") return { ok: false, code: "not_in_app" };
  if (who.household.id !== householdId) return { ok: false, code: "other_household" };
  if (who.memberType === "child") return { ok: false, code: "child" };
  return { ok: true };
}

/** Whether the person is the owner: the Danger zone (with its "Download full data") is shown to them alone. */
export function isHouseholdOwner(who: Who): boolean {
  return mayResetHome(who, "app").ok;
}

/** Pure: the typed name matches the home's, as the database compares it (case and outer spaces ignored). */
export function confirmsHomeName(typed: string, householdName: string): boolean {
  return typed.trim().toLowerCase() === householdName.trim().toLowerCase() && typed.trim().length > 0;
}
