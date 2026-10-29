import { asAutonomyMode } from "@wonderhome/core/household/autonomy";

import type { Session } from "./session";

/** The join the Responsibilities, Househelper, Home and Family screens all read, so "3 responsibilities" means the same three rows everywhere. */
export type ResponsibilityJoinRow = {
  outcome_key: string;
  primary_member_id: string | null;
  backup_member_id: string | null;
  ai_mode: "prepare" | "execute";
  playbook_items: { name: string; cadence: Record<string, unknown> | null } | { name: string; cadence: Record<string, unknown> | null }[] | null;
};

export type HelperProfileRow = { member_id: string; engagement: "regular" | "occasional" | "service"; started_on: string | null };
export type AvailabilityWindowRow = { member_id: string; day_of_week: number };
export type AvailabilityExceptionRow = { member_id: string; on_date: string; available: boolean; reason: string | null };

type Supabase = Session["supabase"];

export function responsibilitiesFor(memberId: string, rows: readonly ResponsibilityJoinRow[]) {
  return {
    owned: rows.filter((row) => row.primary_member_id === memberId),
    backup: rows.filter((row) => row.backup_member_id === memberId),
  };
}

/** Rejects when the read fails, so a caller decides what a failure shows. */
export function readResponsibilities(supabase: Supabase, householdId: string): Promise<ResponsibilityJoinRow[]> {
  return Promise.resolve(
    supabase
      .from("responsibilities")
      .select("outcome_key, primary_member_id, backup_member_id, ai_mode, playbook_items(name, cadence)")
      .eq("household_id", householdId),
  ).then(({ data, error }) => {
    if (error) throw new Error(`responsibilities failed: ${error.code ?? "unknown"}`);
    return ((data as ResponsibilityJoinRow[] | null) ?? []).map((row) => ({ ...row, ai_mode: asAutonomyMode(row.ai_mode) }));
  });
}

/** The three tables the Househelper screen reads, so "Expected today" means the same thing everywhere. Each falls back to empty. */
export function readHelperAvailability(supabase: Supabase, householdId: string, todayIso: string) {
  return Promise.all([
    (async (): Promise<HelperProfileRow[]> => {
      try {
        const { data } = await supabase.from("helper_profiles").select("member_id, engagement, started_on").eq("household_id", householdId);
        return (data as HelperProfileRow[] | null) ?? [];
      } catch {
        return [];
      }
    })(),
    (async (): Promise<AvailabilityWindowRow[]> => {
      try {
        const { data } = await supabase.from("member_availability").select("member_id, day_of_week").eq("household_id", householdId);
        return (data as AvailabilityWindowRow[] | null) ?? [];
      } catch {
        return [];
      }
    })(),
    (async (): Promise<AvailabilityExceptionRow[]> => {
      try {
        const { data } = await supabase
          .from("availability_exceptions")
          .select("member_id, on_date, available, reason")
          .eq("household_id", householdId)
          .gte("on_date", todayIso)
          .order("on_date");
        return (data as AvailabilityExceptionRow[] | null) ?? [];
      } catch {
        return [];
      }
    })(),
  ]);
}
