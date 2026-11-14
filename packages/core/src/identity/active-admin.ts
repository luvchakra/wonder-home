import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set(["head", "administrator"]);

/**
 * A member who is, right now, an active adult Admin of the household, with
 * the sign-in profile a server-side session acts as; null otherwise. Read
 * with the service-role client by server work that has no member session
 * (a trusted sender's email added on arrival, `homesend/trusted-arrival.ts`).
 * The same roles `wh.admin_households()` counts.
 */
export async function activeAdultAdmin(admin: SupabaseClient, householdId: string, memberId: string): Promise<{ memberId: string; profileId: string } | null> {
  const [member, roles] = await Promise.all([
    admin.from("household_members").select("id, profile_id, member_type, status").eq("household_id", householdId).eq("id", memberId).maybeSingle(),
    admin.from("household_roles").select("role").eq("household_id", householdId).eq("member_id", memberId),
  ]);
  const row = member.data as { id: string; profile_id: string | null; member_type: string; status: string } | null;
  if (!row?.profile_id || row.status !== "active" || row.member_type !== "adult") return null;
  const isAdmin = ((roles.data ?? []) as { role: string }[]).some((entry) => ADMIN_ROLES.has(entry.role));
  return isAdmin ? { memberId: row.id, profileId: row.profile_id } : null;
}
