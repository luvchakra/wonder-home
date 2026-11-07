import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlatformAdmin } from "./admin";

/**
 * Account-level lists for the platform owner (owner, 2026-11-07). Each call is
 * a service-role-only database function that re-checks the actor is an active
 * platform owner, returns the fields below and nothing else, and audits the
 * view. Household content is never in reach of these functions.
 */
export const PAGE_SIZE = 25;

export type PlanCount = { key: string; name: string; count: number; noRecord: number };
export type HouseholdRow = { id: string; name: string; status: string; created_at: string; plan_key: string; plan_name: string; members: number; last_active: string | null };
export type PersonRow = {
  id: string; name: string; type: "adult" | "child" | "helper"; created_at: string; email: string | null;
  last_sign_in: string | null; has_signed_in: boolean; admin: boolean; household_id: string; household_name: string;
};
export type GrantRow = { id: string; household_id: string; household_name: string; scope: string; reason_code: string; granted_at: string; expires_at: string; granted_by: string };
export type HouseholdDetail = {
  id: string; name: string; status: string; createdAt: string; planKey: string; planName: string; lastActive: string | null;
  people: { name: string; type: "adult" | "child" | "helper"; admin: boolean; signedIn: boolean }[];
};
export type Page<T> = { total: number; rows: T[] };

export class PlatformOwnerRequired extends Error {}

/** Only the platform owner reads these lists; staff of any other role keeps the totals page. */
export function assertOwner(actor: PlatformAdmin): void {
  if (actor.role !== "owner") throw new PlatformOwnerRequired("platform owner only");
}

async function call<T>(admin: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.code ?? "unknown"}`);
  return data as T;
}

export function planBreakdown(admin: SupabaseClient, actor: PlatformAdmin): Promise<PlanCount[]> {
  assertOwner(actor);
  return call(admin, "platform_plan_breakdown", { p_actor: actor.profileId });
}
export function listHouseholds(admin: SupabaseClient, actor: PlatformAdmin, f: { plan?: string; search?: string; page: number }): Promise<Page<HouseholdRow>> {
  assertOwner(actor);
  return call(admin, "platform_directory_households", { p_actor: actor.profileId, p_plan: f.plan ?? null, p_search: f.search ?? null, p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE });
}
export function householdDetail(admin: SupabaseClient, actor: PlatformAdmin, id: string): Promise<HouseholdDetail | null> {
  assertOwner(actor);
  return call(admin, "platform_directory_household", { p_actor: actor.profileId, p_household: id });
}
export function listPeople(admin: SupabaseClient, actor: PlatformAdmin, f: { search?: string; page: number }): Promise<Page<PersonRow>> {
  assertOwner(actor);
  return call(admin, "platform_directory_people", { p_actor: actor.profileId, p_search: f.search ?? null, p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE });
}
export function listGrants(admin: SupabaseClient, actor: PlatformAdmin): Promise<GrantRow[]> {
  assertOwner(actor);
  return call(admin, "platform_directory_grants", { p_actor: actor.profileId });
}
