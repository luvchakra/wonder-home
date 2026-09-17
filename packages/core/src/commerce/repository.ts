import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "../home/assessment";
import {
  assessConsumable,
  mayCreateShoppingAction,
  suggestPurchase,
  type Consumable,
  type ConsumableCategory,
  type EvidenceBasis,
} from "./consumables";
import { evaluatePurchase, type PolicyDecision, type PurchasePolicy, type PurchaseRequest } from "./policy";
import { idempotencyKeyFor, isLate, type Order, type OrderStatus } from "./orders";

/**
 * Reading and writing the shopping domain (module 09).
 *
 * The one thing this module must never do is spend money as a side effect of a
 * read. Suggestions, comparisons and policy decisions are all computed without
 * touching a merchant; `prepareOrder` builds a draft and stops, because the
 * acceptance criterion is that a household sees cost and quantity "before any
 * purchase side effect occurs".
 */

type Row = Record<string, unknown>;

export async function listConsumables(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Consumable[]> {
  const { data, error } = await supabase
    .from("consumables")
    .select(
      "id, name, category, pet_id, unit, typical_quantity, days_per_unit, evidence_basis, last_purchased_on, last_purchased_quantity",
    )
    .eq("household_id", householdId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(`listConsumables failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    name: row.name as string,
    category: row.category as ConsumableCategory,
    petId: (row.pet_id as string | null) ?? null,
    unit: row.unit as string,
    typicalQuantity: Number(row.typical_quantity),
    daysPerUnit: row.days_per_unit === null ? null : Number(row.days_per_unit),
    evidenceBasis: (row.evidence_basis as EvidenceBasis | null) ?? null,
    lastPurchasedOn: (row.last_purchased_on as string | null) ?? null,
    lastPurchasedQuantity:
      row.last_purchased_quantity === null ? null : Number(row.last_purchased_quantity),
  }));
}

export async function listPolicies(
  supabase: SupabaseClient,
  householdId: string,
): Promise<PurchasePolicy[]> {
  const { data, error } = await supabase
    .from("purchase_policies")
    .select("scope, scope_value, auto_approve_under_minor, hard_limit_minor, currency, active")
    .eq("household_id", householdId);

  if (error) throw new Error(`listPolicies failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => ({
    scope: row.scope as PurchasePolicy["scope"],
    scopeValue: (row.scope_value as string | null) ?? null,
    autoApproveUnderMinor:
      row.auto_approve_under_minor === null ? null : Number(row.auto_approve_under_minor),
    hardLimitMinor: row.hard_limit_minor === null ? null : Number(row.hard_limit_minor),
    currency: row.currency as string,
    active: row.active as boolean,
  }));
}

export async function listOrders(supabase: SupabaseClient, householdId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, provider, status, total_minor, currency, placed_at, expected_at, delivered_at, idempotency_key")
    .eq("household_id", householdId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`listOrders failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    provider: row.provider as string,
    status: row.status as OrderStatus,
    totalMinor: Number(row.total_minor),
    currency: row.currency as string,
    placedAt: row.placed_at ? new Date(row.placed_at as string) : null,
    expectedAt: row.expected_at ? new Date(row.expected_at as string) : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at as string) : null,
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
  }));
}

export type ShoppingAgenda = {
  needed: HomeAssessment[];
  lateOrders: HomeAssessment[];
  checked: number;
};

export async function shoppingAgenda(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date } = {},
): Promise<ShoppingAgenda> {
  const now = options.now ?? new Date();

  const [consumables, orders] = await Promise.all([
    listConsumables(supabase, householdId),
    listOrders(supabase, householdId),
  ]);

  const needed = consumables
    .map((consumable) => assessConsumable(consumable, now))
    .filter((assessment) => assessment.notable);

  const lateOrders = orders
    .filter((order) => isLate(order, now))
    .map((order) => ({
      subjectKey: `order.${order.id}`,
      title: `Order from ${order.provider}`,
      status: "at_risk" as const,
      riskLevel: "medium" as const,
      notable: true,
      reason: `This was expected by ${order.expectedAt?.toISOString().slice(0, 10)} and has not arrived.`,
      action: { action: "chase_order", target: order.id },
      dueOn: order.expectedAt ? order.expectedAt.toISOString().slice(0, 10) : null,
    }));

  return { needed, lateOrders, checked: consumables.length + orders.length };
}

/**
 * Refreshes the suggestion list from what the household is running out of.
 *
 * Every row written here carries its reason and its evidence basis, and
 * anything that cannot justify itself is skipped rather than written with a
 * vague explanation.
 */
export async function refreshSuggestions(
  supabase: SupabaseClient,
  householdId: string,
  now: Date = new Date(),
): Promise<{ written: number; skipped: number }> {
  const consumables = await listConsumables(supabase, householdId);

  const rows = consumables
    .filter((consumable) => mayCreateShoppingAction(consumable).allowed)
    .map((consumable) => ({ consumable, suggestion: suggestPurchase(consumable, now) }))
    .filter((entry) => entry.suggestion !== null)
    .map((entry) => ({
      household_id: householdId,
      consumable_id: entry.consumable.id,
      quantity: entry.suggestion!.quantity,
      reason: entry.suggestion!.reason,
      evidence_basis: entry.suggestion!.evidenceBasis,
      needed_by: entry.suggestion!.neededBy,
      status: "suggested",
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("cart_suggestions")
      .upsert(rows, { onConflict: "household_id,consumable_id,status" });

    if (error) throw new Error(`refreshSuggestions failed: ${error.code ?? "unknown"}`);
  }

  return { written: rows.length, skipped: consumables.length - rows.length };
}

export type PreparedOrder = {
  decision: PolicyDecision;
  request: PurchaseRequest;
  idempotencyKey: string;
  /** Deliberately absent until a person or a policy says yes. */
  placed: false;
};

/**
 * Works out what an order would cost and whether it may go ahead.
 *
 * Nothing is bought here. The household sees the amount, the merchant and the
 * decision first, which is the sequence the acceptance criteria require and
 * also the only sequence a family would forgive.
 */
export async function prepareOrder(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    provider: string;
    category: string;
    forDate: string;
    currency: string;
    lineItems: readonly { consumableId: string | null; description: string; quantity: number; unitPriceMinor: number }[];
  },
): Promise<PreparedOrder> {
  if (input.lineItems.length === 0) throw ApiError.badRequest("An order needs something in it.");

  const totalMinor = input.lineItems.reduce(
    (total, item) => total + Math.round(item.unitPriceMinor * item.quantity),
    0,
  );

  const request: PurchaseRequest = {
    totalMinor,
    currency: input.currency,
    category: input.category,
    merchant: input.provider,
    consumableIds: input.lineItems
      .map((item) => item.consumableId)
      .filter((id): id is string => id !== null),
  };

  const decision = evaluatePurchase(await listPolicies(supabase, input.householdId), request);

  return {
    decision,
    request,
    idempotencyKey: idempotencyKeyFor({
      householdId: input.householdId,
      provider: input.provider,
      forDate: input.forDate,
      lineItems: input.lineItems,
    }),
    placed: false,
  };
}
