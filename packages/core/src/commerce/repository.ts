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
import { historyFrom } from "./receipts";
import { evaluatePurchase, type PolicyDecision, type PurchasePolicy, type PurchaseRequest } from "./policy";
import { idempotencyKeyFor, isLate, type Order, type OrderStatus } from "./orders";
import { invalidatesContext } from "../context/invalidation";

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

/** Names for specific consumables, retired ones included — a HomeSend change can name an item it later undid. */
export async function consumableNames(supabase: SupabaseClient, householdId: string, ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from("consumables").select("id, name").eq("household_id", householdId).in("id", [...ids]);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [String(row.id), String(row.name)]));
}

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

export type CreateConsumableInput = {
  householdId: string;
  name: string;
  category: ConsumableCategory;
  unit: string;
  typicalQuantity: number;
  /** How often the household goes through one typical quantity — telling WonderHome this directly is "member_stated" evidence, same as any other basis. */
  daysPerUnit?: number | null;
};

async function createConsumableImpl(
  supabase: SupabaseClient,
  input: CreateConsumableInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("consumables")
    .insert({
      household_id: input.householdId,
      name: input.name,
      category: input.category,
      unit: input.unit,
      typical_quantity: input.typicalQuantity,
      days_per_unit: input.daysPerUnit ?? null,
      evidence_basis: input.daysPerUnit ? "member_stated" : null,
      active: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot add items for this household.");
    if (error.code === "23505")
      throw ApiError.conflict(
        `WonderHome is already tracking "${input.name}" in ${input.category} — edit that one instead of adding it again.`,
      );
    throw new Error(`createConsumable failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

export type UpdateConsumableInput = {
  id: string;
  householdId: string;
  name: string;
  category: ConsumableCategory;
  unit: string;
  typicalQuantity: number;
  daysPerUnit?: number | null;
};

/** Changing what was told about something already tracked — never touches purchase history. */
async function updateConsumableImpl(
  supabase: SupabaseClient,
  input: UpdateConsumableInput,
): Promise<void> {
  const { error } = await supabase
    .from("consumables")
    .update({
      name: input.name,
      category: input.category,
      unit: input.unit,
      typical_quantity: input.typicalQuantity,
      days_per_unit: input.daysPerUnit ?? null,
      evidence_basis: input.daysPerUnit ? "member_stated" : null,
    })
    .eq("id", input.id)
    .eq("household_id", input.householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot change items for this household.");
    if (error.code === "23505")
      throw ApiError.conflict(
        `WonderHome is already tracking "${input.name}" in ${input.category} under a different entry — choose another name or edit that one instead.`,
      );
    throw new Error(`updateConsumable failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * "Stop tracking" — `active = false`, never a delete. A retired item's own
 * purchase and order history stays intact and readable, and the name frees
 * up for the same reason a stood-down policy's name does
 * (`consumables_active_name_unique`, a partial index like the policy's own).
 */
async function retireConsumableImpl(
  supabase: SupabaseClient,
  input: { id: string; householdId: string },
): Promise<void> {
  const { error } = await supabase
    .from("consumables")
    .update({ active: false })
    .eq("id", input.id)
    .eq("household_id", input.householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot change items for this household.");
    throw new Error(`retireConsumable failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * A purchase that actually happened (09-009): one row of
 * `consumable_purchases`, then the consumable's own history refreshed from
 * every purchase it now has — when it was last bought, how much, and the
 * rate those purchases support. Only ever called once a person has confirmed
 * the line it came from.
 */
async function recordPurchaseImpl(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    consumableId: string;
    purchasedOn: string;
    quantity: number;
    unitCostMinor?: number | null;
    currency?: string | null;
    merchant?: string | null;
  },
): Promise<{ id: string }> {
  const cost = input.unitCostMinor != null && input.currency ? { unit_cost_minor: input.unitCostMinor, currency: input.currency } : { unit_cost_minor: null, currency: null };
  const { data, error } = await supabase
    .from("consumable_purchases")
    .insert({
      household_id: input.householdId,
      consumable_id: input.consumableId,
      purchased_on: input.purchasedOn,
      quantity: input.quantity,
      merchant: input.merchant?.trim().slice(0, 120) || null,
      ...cost,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot record purchases for this household.");
    throw new Error(`recordPurchase failed: ${error.code ?? "unknown"}`);
  }
  await refreshPurchaseHistory(supabase, input.householdId, input.consumableId);
  return { id: (data as Row).id as string };
}

/** Undoing a recorded purchase: the row goes, and the history is what the remaining purchases say. */
async function removePurchaseImpl(supabase: SupabaseClient, input: { householdId: string; purchaseId: string }): Promise<void> {
  const { data, error } = await supabase
    .from("consumable_purchases")
    .delete()
    .eq("id", input.purchaseId)
    .eq("household_id", input.householdId)
    .select("consumable_id");

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot change purchases for this household.");
    throw new Error(`removePurchase failed: ${error.code ?? "unknown"}`);
  }
  const consumableId = (data as Row[] | null)?.[0]?.consumable_id as string | undefined;
  if (consumableId) await refreshPurchaseHistory(supabase, input.householdId, consumableId);
}

async function refreshPurchaseHistory(supabase: SupabaseClient, householdId: string, consumableId: string): Promise<void> {
  const [purchases, current] = await Promise.all([
    supabase.from("consumable_purchases").select("purchased_on, quantity").eq("household_id", householdId).eq("consumable_id", consumableId),
    supabase.from("consumables").select("days_per_unit, evidence_basis").eq("household_id", householdId).eq("id", consumableId).single(),
  ]);
  if (purchases.error) throw new Error(`refreshPurchaseHistory failed: ${purchases.error.code ?? "unknown"}`);
  if (current.error) throw new Error(`refreshPurchaseHistory failed: ${current.error.code ?? "unknown"}`);
  const row = current.data as Row;
  const history = historyFrom(
    ((purchases.data ?? []) as Row[]).map((purchase) => ({ purchasedOn: String(purchase.purchased_on), quantity: Number(purchase.quantity) })),
    { daysPerUnit: row.days_per_unit === null ? null : Number(row.days_per_unit), evidenceBasis: (row.evidence_basis as EvidenceBasis | null) ?? null },
  );
  const { error } = await supabase
    .from("consumables")
    .update({
      last_purchased_on: history.lastPurchasedOn,
      last_purchased_quantity: history.lastPurchasedQuantity,
      days_per_unit: history.daysPerUnit,
      evidence_basis: history.evidenceBasis,
    })
    .eq("household_id", householdId)
    .eq("id", consumableId);
  if (error) throw new Error(`refreshPurchaseHistory failed: ${error.code ?? "unknown"}`);
}

/** "Milk × 2" for specific purchases, by id — how a HomeSend history names each line it recorded. An undone one is gone and has no label. */
export async function purchaseLabels(supabase: SupabaseClient, householdId: string, ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("consumable_purchases")
    .select("id, quantity, consumables(name, unit)")
    .eq("household_id", householdId)
    .in("id", [...ids]);
  if (error) throw error;
  return Object.fromEntries(
    ((data ?? []) as Row[]).map((row) => {
      const item = (Array.isArray(row.consumables) ? row.consumables[0] : row.consumables) as Row | null;
      const quantity = Number(row.quantity);
      const unit = item?.unit && item.unit !== "unit" ? ` ${String(item.unit)}` : "";
      return [String(row.id), `${String(item?.name ?? "An item")} × ${Number.isInteger(quantity) ? quantity : quantity.toFixed(2)}${unit}`];
    }),
  );
}

export type PurchaseRecord = { id: string; consumableId: string; purchasedOn: string; quantity: number; unitCostMinor: number | null; currency: string | null; merchant: string | null };

/** The most recent purchases, newest first — per consumable when asked. */
export async function listPurchases(supabase: SupabaseClient, householdId: string, options: { consumableId?: string; limit?: number } = {}): Promise<PurchaseRecord[]> {
  let query = supabase
    .from("consumable_purchases")
    .select("id, consumable_id, purchased_on, quantity, unit_cost_minor, currency, merchant")
    .eq("household_id", householdId)
    .order("purchased_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (options.consumableId) query = query.eq("consumable_id", options.consumableId);
  const { data, error } = await query;
  if (error) throw new Error(`listPurchases failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    consumableId: String(row.consumable_id),
    purchasedOn: String(row.purchased_on),
    quantity: Number(row.quantity),
    unitCostMinor: row.unit_cost_minor === null ? null : Number(row.unit_cost_minor),
    currency: (row.currency as string | null) ?? null,
    merchant: (row.merchant as string | null) ?? null,
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
async function refreshSuggestionsImpl(
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
async function prepareOrderImpl(
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

// Every write forgets the household's cached context once it succeeds, so
// the next HomeTalk answer sees the change (Wave 1 §14).
export const createConsumable = invalidatesContext(createConsumableImpl, (_supabase, input) => input.householdId);
export const updateConsumable = invalidatesContext(updateConsumableImpl, (_supabase, input) => input.householdId);
export const retireConsumable = invalidatesContext(retireConsumableImpl, (_supabase, input) => input.householdId);
export const recordPurchase = invalidatesContext(recordPurchaseImpl, (_supabase, input) => input.householdId);
export const removePurchase = invalidatesContext(removePurchaseImpl, (_supabase, input) => input.householdId);
export const refreshSuggestions = invalidatesContext(refreshSuggestionsImpl, (_supabase, householdId) => householdId);
export const prepareOrder = invalidatesContext(prepareOrderImpl, (_supabase, input) => input.householdId);
