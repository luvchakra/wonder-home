"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { reportLocation, setLocationAudience, setLocationSharing } from "@wonderhome/core/location/sharing";

import type { ActionState } from "./actions";

/**
 * Location sharing, by consent (the owner, 2026-10-20). Turning it on or off
 * runs under the person's own session, so the table's policy decides who may:
 * an adult or helper for themselves, a child's guardian or an Admin for the
 * child, nobody else. Off deletes the position at once.
 */
export async function setLocationSharingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ householdId: z.uuid(), memberId: z.uuid(), enabled: z.enum(["on", "off"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await setLocationSharing(supabase, {
      householdId: parsed.data.householdId,
      memberId: parsed.data.memberId,
      enabled: parsed.data.enabled === "on",
      setBy: membership.memberId,
    });
    revalidatePath("/family");
    revalidatePath("/settings/location");
    revalidatePath("/settings");
    return { notice: parsed.data.enabled };
  } catch (error) {
    return { error: toErrorBody(error, "location").body.error.message };
  }
}

/**
 * Who may see a sharer's location: the family's adults only (the default), or
 * the children too (the owner, 2026-10-29). Runs under the person's own
 * session; the table's policy decides who may change it — the sharer, or a
 * child's guardian or an Admin. Saves the moment the choice is picked.
 */
export async function setLocationAudienceAction(input: { householdId: string; memberId: string; visibleToChildren: boolean }): Promise<ActionState> {
  const parsed = z.object({ householdId: z.uuid(), memberId: z.uuid(), visibleToChildren: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await setLocationAudience(supabase, {
      householdId: parsed.data.householdId,
      memberId: parsed.data.memberId,
      visibleToChildren: parsed.data.visibleToChildren,
      setBy: membership.memberId,
    });
    revalidatePath("/family");
    revalidatePath("/settings/location");
    return { notice: "saved" };
  } catch (error) {
    return { error: toErrorBody(error, "location").body.error.message };
  }
}

type Mine = { id: string; household_id: string };

/** Whether this device should report: the signed-in person shares in at least one household. False when signed out. */
export async function mySharingOnAction(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { data: mine } = await supabase.from("household_members").select("id, household_id").eq("profile_id", auth.user.id).eq("status", "active").limit(10);
    const ids = ((mine ?? []) as Mine[]).map((row) => row.id);
    if (ids.length === 0) return false;
    const { data } = await supabase.from("member_location_sharing").select("member_id").in("member_id", ids).eq("enabled", true).limit(10);
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * The person's own device says where it is. Kept only for the households
 * where their sharing is on (the policy refuses the rest), as the latest
 * position, rounded. Nothing else is kept and nothing is returned.
 */
export async function reportMyLocationAction(position: { latitude: number; longitude: number; accuracy?: number | null }): Promise<boolean> {
  const parsed = z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).nullish() })
    .safeParse(position);
  if (!parsed.success) return false;
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { data: mine } = await supabase.from("household_members").select("id, household_id").eq("profile_id", auth.user.id).eq("status", "active").limit(10);
    const members = (mine ?? []) as Mine[];
    if (members.length === 0) return false;
    const { data: sharing } = await supabase.from("member_location_sharing").select("member_id").in("member_id", members.map((row) => row.id)).eq("enabled", true).limit(10);
    const on = new Set(((sharing ?? []) as { member_id: string }[]).map((row) => row.member_id));
    const results = await Promise.all(
      members
        .filter((row) => on.has(row.id))
        .map((row) =>
          reportLocation(supabase, { householdId: row.household_id, memberId: row.id, latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracyM: parsed.data.accuracy ?? null }),
        ),
    );
    return results.some(Boolean);
  } catch {
    return false;
  }
}
