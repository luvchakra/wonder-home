import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { createConsumable, listConsumables } from "../commerce/repository";
import { requireScope, type PartnerActor } from "./keys";

/**
 * What a partner key can do (story 18-008), and nothing else.
 *
 * Every call runs through the service-role client, because a partner has no
 * session for RLS to read, so every query here names the key's own
 * household explicitly and only that one. Writes go through the same domain
 * service the Groceries screen uses. A sandbox key reads the fixed fixtures
 * below and writes nothing: it answers what would have happened.
 */

export const SANDBOX_HOUSEHOLD = { name: "Sandbox Household", timezone: "Asia/Kolkata", members: 4 } as const;
export const SANDBOX_GROCERIES = [
  { id: "sandbox-milk", name: "Milk", category: "dairy", unit: "l" },
  { id: "sandbox-bread", name: "Bread", category: "bakery", unit: "item" },
  { id: "sandbox-rice", name: "Basmati rice", category: "grocery", unit: "kg" },
] as const;

export type PartnerHousehold = { name: string; timezone: string; members: number; environment: PartnerActor["environment"] };

export async function partnerHousehold(admin: SupabaseClient, actor: PartnerActor): Promise<PartnerHousehold> {
  requireScope(actor, "household.read");
  if (actor.environment === "sandbox") return { ...SANDBOX_HOUSEHOLD, environment: "sandbox" };
  const [{ data: household }, { count }] = await Promise.all([
    admin.from("households").select("name, timezone").eq("id", actor.householdId).maybeSingle(),
    admin.from("household_members").select("id", { count: "exact", head: true }).eq("household_id", actor.householdId).eq("status", "active"),
  ]);
  if (!household) throw ApiError.notFound();
  const row = household as { name: string; timezone: string };
  // Names of people are never part of this: a count, not a list.
  return { name: row.name, timezone: row.timezone, members: count ?? 0, environment: "live" };
}

export type PartnerGrocery = { id: string; name: string; category: string; unit: string };

export async function partnerGroceries(admin: SupabaseClient, actor: PartnerActor): Promise<PartnerGrocery[]> {
  requireScope(actor, "groceries.read");
  if (actor.environment === "sandbox") return SANDBOX_GROCERIES.map((item) => ({ ...item }));
  const items = await listConsumables(admin, actor.householdId);
  return items.map((item) => ({ id: item.id, name: item.name, category: item.category, unit: item.unit }));
}

export type PartnerAddResult = { name: string; outcome: "added" | "already_on_list" | "would_add"; id: string | null };

/** Adds names to the grocery list, one each; a name already there is said so, never a second copy. */
export async function partnerAddGroceries(admin: SupabaseClient, actor: PartnerActor, names: readonly string[]): Promise<PartnerAddResult[]> {
  requireScope(actor, "groceries.write");
  const cleaned = [...new Map(names.map((raw) => raw.trim()).filter(Boolean).map((name) => [name.toLowerCase(), name])).values()];
  if (cleaned.length === 0) throw ApiError.badRequest("Name at least one thing to add.");

  const existing = actor.environment === "sandbox" ? SANDBOX_GROCERIES.map((item) => ({ id: item.id, name: item.name })) : await listConsumables(admin, actor.householdId);
  const known = new Map(existing.map((item) => [item.name.toLowerCase(), item.id]));

  const results: PartnerAddResult[] = [];
  for (const name of cleaned) {
    const already = known.get(name.toLowerCase());
    if (already) {
      results.push({ name, outcome: "already_on_list", id: already });
      continue;
    }
    if (actor.environment === "sandbox") {
      results.push({ name, outcome: "would_add", id: null });
      continue;
    }
    try {
      const { id } = await createConsumable(admin, { householdId: actor.householdId, name, category: "grocery", unit: "item", typicalQuantity: 1 });
      results.push({ name, outcome: "added", id });
    } catch (thrown) {
      if (thrown instanceof ApiError && thrown.code === "conflict") results.push({ name, outcome: "already_on_list", id: null });
      else throw thrown;
    }
  }
  return results;
}
