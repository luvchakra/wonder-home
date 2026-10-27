import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { signAvatarPaths } from "../identity/households";
import { CATALOG_COLUMNS, toCatalogEntry, type CatalogEntry } from "./catalog";
import { refreshPurchaseHistory } from "./repository";
import { compatible, stepInBase, toBase, unitInfo, type Amount } from "./units";

/**
 * Groceries: what is at home and what to buy (Groceries Phase 1,
 * design/GROCERIES-PANTRY-HOMETALK-PHASE0.md §4.3).
 *
 * The one way anything changes either amount. The screens call it, and so
 * will HomeTalk, HomeSend and the agents — none of them writes the tables,
 * which sessions cannot write anyway (`apply_inventory_change`,
 * `adjust_shopping_entry` and `mark_bought` do the arithmetic and the checks
 * in one statement each). Here amounts are put into the item's base unit
 * before they leave, and a unit that does not convert is refused in words.
 *
 * Two rules the whole feature rests on:
 *  - "At home" and "to buy" never overwrite each other. A stepper changes the
 *    list; only an explicit stock change changes stock.
 *  - Nothing is ever said about stock that nobody confirmed. No balance row
 *    is "unknown", and a purchase date is never read as "used up".
 */

type Row = Record<string, unknown>;

export type StockStatus = "unknown" | "none" | "low" | "enough";

export type GroceryStock = {
  quantity: number;
  /** Base unit: g, ml, pcs, or the item's own word. */
  unit: string;
  confirmedAt: string;
  confirmedBy: string | null;
  source: string;
  version: number;
  useBy: string | null;
  useByBasis: "printed" | "entered" | "estimated" | null;
};

export type GroceryToBuy = {
  entryId: string;
  quantity: number;
  unit: string;
  version: number;
  source: string;
  mealId: string | null;
};

export type GroceryItem = {
  id: string;
  name: string;
  category: string;
  /** Preferred unit, as the household picked it. */
  unit: string;
  step: number | null;
  lowLevel: number | null;
  storage: "fridge" | "freezer" | "pantry" | "other" | null;
  note: string | null;
  aliases: string[];
  imageUrl: string | null;
  imagePath: string | null;
  /** The shared catalog entry it was picked from (25-006): its picture, pack and nutrients. */
  catalog: CatalogEntry | null;
  lastPurchasedOn: string | null;
  /**
   * The most recent of the item's own, its stock's and its open to-buy
   * entry's `updated_at` — "last touched", for the "Recently updated" sort
   * (25-0xx). Always set: an item at least has its own row's timestamp.
   */
  updatedAt: string;
  stock: GroceryStock | null;
  toBuy: GroceryToBuy | null;
};

/** The latest of some ISO timestamps, ignoring blanks; "" when there are none. */
function latestOf(times: (string | null | undefined)[]): string {
  let best = "";
  let bestMs = -Infinity;
  for (const time of times) {
    if (!time) continue;
    const ms = Date.parse(time);
    if (Number.isNaN(ms) ? time > best : ms > bestMs) {
      best = time;
      bestMs = Number.isNaN(ms) ? bestMs : ms;
    }
  }
  return best;
}

/** Low, none, enough — or unknown, when nobody has said how much there is. */
export function stockStatus(
  item: Pick<GroceryItem, "stock" | "lowLevel">,
): StockStatus {
  if (!item.stock) return "unknown";
  if (item.stock.quantity <= 0) return "none";
  if (item.lowLevel !== null && item.stock.quantity <= item.lowLevel)
    return "low";
  return "enough";
}

/** One step of the item's stepper, in base units. */
export function itemStep(item: Pick<GroceryItem, "unit" | "step">): Amount {
  return stepInBase(item.unit, item.step);
}

/** The base unit both amounts of this item are kept in. */
export function itemBaseUnit(item: Pick<GroceryItem, "unit">): string {
  return unitInfo(item.unit).base;
}

const ITEM_COLUMNS =
  "id, name, category, unit, step, low_level, storage, note, aliases, image_path, last_purchased_on, updated_at, " +
  `grocery_catalog(${CATALOG_COLUMNS}), ` +
  "inventory_balances(quantity, unit, confirmed_at, updated_at, source, version, use_by, use_by_basis, household_members(display_name)), " +
  "shopping_list_entries(id, quantity, unit, updated_at, version, source, meal_id, state)";

function toItem(row: Row, imageUrls: Map<string, string>): GroceryItem {
  const balanceRow = (
    Array.isArray(row.inventory_balances)
      ? row.inventory_balances[0]
      : row.inventory_balances
  ) as Row | null | undefined;
  const entries = (
    Array.isArray(row.shopping_list_entries) ? row.shopping_list_entries : []
  ) as Row[];
  const open = entries.find((entry) => entry.state === "to_buy");
  const confirmer = balanceRow?.household_members as Row | null | undefined;
  // "Last touched": the most recent of the item, its stock and its open
  // to-buy entry. A closed entry does not count — it is not in `entries`,
  // which the query narrows to `to_buy`.
  const updatedAt = latestOf([
    row.updated_at as string | null | undefined,
    balanceRow?.updated_at as string | null | undefined,
    open?.updated_at as string | null | undefined,
  ]);
  const imagePath = (row.image_path as string | null) ?? null;
  const catalogRow = (Array.isArray(row.grocery_catalog) ? row.grocery_catalog[0] : row.grocery_catalog) as Row | null | undefined;
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    unit: row.unit as string,
    step: row.step === null || row.step === undefined ? null : Number(row.step),
    lowLevel:
      row.low_level === null || row.low_level === undefined
        ? null
        : Number(row.low_level),
    storage: (row.storage as GroceryItem["storage"]) ?? null,
    note: (row.note as string | null) ?? null,
    aliases: (row.aliases as string[] | null) ?? [],
    imagePath,
    imageUrl: imagePath ? (imageUrls.get(imagePath) ?? null) : null,
    catalog: catalogRow ? toCatalogEntry(catalogRow, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") : null,
    lastPurchasedOn: (row.last_purchased_on as string | null) ?? null,
    updatedAt,
    stock: balanceRow
      ? {
          quantity: Number(balanceRow.quantity),
          unit: balanceRow.unit as string,
          confirmedAt: balanceRow.confirmed_at as string,
          confirmedBy: (confirmer?.display_name as string | undefined) ?? null,
          source: balanceRow.source as string,
          version: Number(balanceRow.version),
          useBy: (balanceRow.use_by as string | null) ?? null,
          useByBasis:
            (balanceRow.use_by_basis as GroceryStock["useByBasis"]) ?? null,
        }
      : null,
    toBuy: open
      ? {
          entryId: open.id as string,
          quantity: Number(open.quantity),
          unit: open.unit as string,
          version: Number(open.version),
          source: open.source as string,
          mealId: (open.meal_id as string | null) ?? null,
        }
      : null,
  };
}

/** Every item the household tracks, with what is at home and what is to buy. */
export async function listGroceries(
  supabase: SupabaseClient,
  householdId: string,
): Promise<GroceryItem[]> {
  const { data, error } = await supabase
    .from("consumables")
    .select(ITEM_COLUMNS)
    .eq("household_id", householdId)
    .eq("active", true)
    .eq("shopping_list_entries.state", "to_buy")
    .order("name", { ascending: true });
  if (error)
    throw new Error(`listGroceries failed: ${error.code ?? "unknown"}`);
  const rows = (data ?? []) as unknown as Row[];
  const imageUrls = await signAvatarPaths(
    supabase,
    rows
      .map((row) => row.image_path as string | null)
      .filter((path): path is string => Boolean(path)),
  );
  return rows.map((row) => toItem(row, imageUrls));
}

/** One item, or null when it is not this household's (or has been retired). */
export async function getGroceryItem(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
): Promise<GroceryItem | null> {
  const { data, error } = await supabase
    .from("consumables")
    .select(ITEM_COLUMNS)
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("active", true)
    .eq("shopping_list_entries.state", "to_buy")
    .maybeSingle();
  if (error)
    throw new Error(`getGroceryItem failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as unknown as Row;
  const imageUrls = row.image_path
    ? await signAvatarPaths(supabase, [row.image_path as string])
    : new Map<string, string>();
  return toItem(row, imageUrls);
}

export type BoughtLine = {
  purchaseId: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  boughtOn: string;
};

/** What was bought from the list since a date, newest first — a partial buy included. */
export async function recentlyBought(
  supabase: SupabaseClient,
  householdId: string,
  sinceDay: string,
): Promise<BoughtLine[]> {
  const { data, error } = await supabase
    .from("consumable_purchases")
    .select(
      "id, consumable_id, quantity, unit, purchased_on, consumables(name)",
    )
    .eq("household_id", householdId)
    .not("shopping_entry_id", "is", null)
    .gte("purchased_on", sinceDay)
    .order("purchased_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    throw new Error(`recentlyBought failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    purchaseId: row.id as string,
    itemId: row.consumable_id as string,
    name: ((row.consumables as Row | null)?.name as string | undefined) ?? "",
    quantity: Number(row.quantity),
    unit: (row.unit as string | null) ?? "pcs",
    boughtOn: row.purchased_on as string,
  }));
}

export type ItemHistoryEntry = {
  at: string;
  kind: string;
  delta: number;
  after: number;
  unit: string;
  by: string | null;
  source: string;
};

/** The last changes to an item's stock, newest first — how a number came to be what it is. */
export async function stockHistory(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  limit = 10,
): Promise<ItemHistoryEntry[]> {
  const { data, error } = await supabase
    .from("inventory_events")
    .select(
      "created_at, kind, delta, after_quantity, unit, source, household_members(display_name)",
    )
    .eq("household_id", householdId)
    .eq("consumable_id", itemId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`stockHistory failed: ${error.code ?? "unknown"}`);
  // A change of unit that sent what was at home back to not counted (25-012)
  // is part of the same story: "counted in grams now; it was 3 pcs".
  const { data: changes } = await supabase
    .from("consumable_unit_changes")
    .select("created_at, stock_before, stock_unit, household_members(display_name)")
    .eq("household_id", householdId)
    .eq("consumable_id", itemId)
    .eq("stock_cleared", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  const unitChanges: ItemHistoryEntry[] = ((changes ?? []) as unknown as Row[]).map((row) => ({
    at: row.created_at as string,
    kind: "unit_change",
    delta: -Number(row.stock_before ?? 0),
    after: 0,
    unit: (row.stock_unit as string | null) ?? "pcs",
    by: ((row.household_members as Row | null)?.display_name as string | undefined) ?? null,
    source: "correction",
  }));
  const events: ItemHistoryEntry[] = ((data ?? []) as unknown as Row[]).map((row) => ({
    at: row.created_at as string,
    kind: row.kind as string,
    delta: Number(row.delta),
    after: Number(row.after_quantity),
    unit: row.unit as string,
    by:
      ((row.household_members as Row | null)?.display_name as
        | string
        | undefined) ?? null,
    source: row.source as string,
  }));
  return [...events, ...unitChanges].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type ChangeResult = {
  before: number | null;
  after: number;
  /** Base unit. */
  unit: string;
  version: number;
  /** A "use" asked for more than there was; it stopped at nothing. */
  clamped: boolean;
  /** The same idempotency key was already applied; nothing changed twice. */
  replayed: boolean;
  /** Someone changed it since the screen read it; nothing was written. */
  conflict: boolean;
  entryId?: string | null;
};

function refusal(
  error: { code?: string; message?: string },
  what: string,
): never {
  if (error.code === "42501")
    throw ApiError.forbidden(
      error.message || `You cannot change ${what} for this household.`,
    );
  if (error.code === "22023")
    throw ApiError.badRequest(
      error.message || "That amount does not fit this item.",
    );
  if (error.code === "23514")
    throw ApiError.notFound("That item is not on record in this household.");
  if (error.code === "P0002")
    throw ApiError.conflict(error.message || "That is no longer on the list.");
  throw new Error(`${what} change failed: ${error.code ?? "unknown"}`);
}

/** The item's name and preferred unit, or a refusal when it is not this household's. */
async function itemUnit(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
): Promise<{ name: string; preferred: string }> {
  const { data, error } = await supabase
    .from("consumables")
    .select("name, unit")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`item lookup failed: ${error.code ?? "unknown"}`);
  if (!data)
    throw ApiError.notFound("That item is not on record in this household.");
  return {
    name: String((data as Row).name),
    preferred: String((data as Row).unit),
  };
}

/** The amount in the item's base unit — or a refusal naming both units. */
function inItemUnit(
  item: { name: string; preferred: string },
  amount: Amount,
): Amount {
  if (!compatible(amount.unit, item.preferred)) {
    throw ApiError.badRequest(
      `${item.name} is kept in ${item.preferred}, and ${amount.unit} does not convert to it.`,
    );
  }
  return toBase(amount.quantity, amount.unit);
}

function readChange(value: unknown): ChangeResult {
  const result = (value ?? {}) as Row;
  return {
    before:
      result.before === null || result.before === undefined
        ? null
        : Number(result.before),
    after: Number(result.after ?? 0),
    unit: String(result.unit ?? ""),
    version: Number(result.version ?? 0),
    clamped: result.clamped === true,
    replayed: result.replayed === true,
    conflict: result.conflict === true,
    entryId: (result.entryId as string | null | undefined) ?? undefined,
  };
}

export type ListChange = {
  householdId: string;
  itemId: string;
  kind: "add" | "subtract" | "set" | "remove";
  /** Ignored for "remove". */
  amount?: Amount;
  source:
    | "manual"
    | "hometalk"
    | "meal"
    | "suggestion"
    | "receipt"
    | "agent"
    | "partner";
  idempotencyKey: string;
  expectedVersion?: number | null;
  mealId?: string | null;
};

async function adjustListEntryImpl(
  supabase: SupabaseClient,
  change: ListChange,
): Promise<ChangeResult> {
  const item = await itemUnit(supabase, change.householdId, change.itemId);
  if (change.kind !== "remove" && !change.amount)
    throw ApiError.badRequest("Say how much.");
  const amount =
    change.kind === "remove"
      ? { quantity: 0, unit: unitInfo(item.preferred).base }
      : inItemUnit(item, change.amount!);
  const { data, error } = await supabase.rpc("adjust_shopping_entry", {
    p_household_id: change.householdId,
    p_consumable_id: change.itemId,
    p_kind: change.kind,
    p_quantity: amount.quantity,
    p_unit: amount.unit,
    p_source: change.source,
    p_idempotency_key: change.idempotencyKey,
    p_expected_version: change.expectedVersion ?? null,
    p_meal_id: change.mealId ?? null,
  });
  if (error) refusal(error, "the list");
  return readChange(data);
}

export type StockChange = {
  householdId: string;
  itemId: string;
  kind: "set" | "add" | "use";
  amount: Amount;
  source:
    | "stated"
    | "purchase"
    | "consumption"
    | "correction"
    | "receipt"
    | "undo";
  idempotencyKey: string;
  expectedVersion?: number | null;
  sourceRef?: Record<string, unknown>;
};

async function changeStockImpl(
  supabase: SupabaseClient,
  change: StockChange,
): Promise<ChangeResult> {
  const amount = inItemUnit(
    await itemUnit(supabase, change.householdId, change.itemId),
    change.amount,
  );
  const { data, error } = await supabase.rpc("apply_inventory_change", {
    p_household_id: change.householdId,
    p_consumable_id: change.itemId,
    p_kind: change.kind,
    p_quantity: amount.quantity,
    p_unit: amount.unit,
    p_source: change.source,
    p_idempotency_key: change.idempotencyKey,
    p_expected_version: change.expectedVersion ?? null,
    p_source_ref: change.sourceRef ?? {},
  });
  if (error) refusal(error, "what is at home");
  return readChange(data);
}

/** Setting or clearing a use-by date someone read off the pack (never estimated here). */
async function setUseByImpl(
  supabase: SupabaseClient,
  input: { householdId: string; itemId: string; useBy: string | null },
): Promise<void> {
  const { data, error } = await supabase.rpc("set_inventory_use_by", {
    p_household_id: input.householdId,
    p_consumable_id: input.itemId,
    p_use_by: input.useBy,
  });
  if (error) refusal(error, "what is at home");
  if (data === false)
    throw ApiError.badRequest(
      "Say how much is at home first, then when it should be used by.",
    );
}

export type BoughtChange = {
  householdId: string;
  entryId: string;
  itemId: string;
  amount: Amount;
  purchasedOn: string;
  idempotencyKey: string;
  merchant?: string | null;
};

/** Bought from the list: a purchase, the amount added at home, and the list entry closed or left with the rest. */
async function markBoughtImpl(
  supabase: SupabaseClient,
  change: BoughtChange,
): Promise<{
  remaining: number;
  unit: string;
  stockAfter: number | null;
  replayed: boolean;
}> {
  const amount = inItemUnit(
    await itemUnit(supabase, change.householdId, change.itemId),
    change.amount,
  );
  const { data, error } = await supabase.rpc("mark_bought", {
    p_household_id: change.householdId,
    p_entry_id: change.entryId,
    p_quantity: amount.quantity,
    p_purchased_on: change.purchasedOn,
    p_idempotency_key: change.idempotencyKey,
    p_merchant: change.merchant ?? null,
  });
  if (error) refusal(error, "the list");
  const result = (data ?? {}) as Row;
  if (result.replayed !== true)
    await refreshPurchaseHistory(supabase, change.householdId, change.itemId);
  return {
    remaining: Number(result.remaining ?? 0),
    unit: String(result.unit ?? amount.unit),
    stockAfter:
      result.stockAfter === null || result.stockAfter === undefined
        ? null
        : Number(result.stockAfter),
    replayed: result.replayed === true,
  };
}

// Every write forgets the household's cached context once it succeeds, so the
// next HomeTalk answer sees the change (Wave 1 §14).
export const adjustListEntry = invalidatesContext(
  adjustListEntryImpl,
  (_supabase, change) => change.householdId,
);
export const changeStock = invalidatesContext(
  changeStockImpl,
  (_supabase, change) => change.householdId,
);
export const setUseBy = invalidatesContext(
  setUseByImpl,
  (_supabase, input) => input.householdId,
);
export const markBought = invalidatesContext(
  markBoughtImpl,
  (_supabase, change) => change.householdId,
);

/**
 * The one stock or list change a write made, found by the idempotency key it
 * was written with — so undoing a receipt line reverses exactly that change
 * and nothing anyone did since (HomeFood 25-003b). Null when it never happened.
 */
export async function recordedChange(
  supabase: SupabaseClient,
  householdId: string,
  table: "inventory_events" | "shopping_list_events",
  idempotencyKey: string,
): Promise<{ itemId: string; delta: number; unit: string } | null> {
  const { data, error } = await supabase
    .from(table)
    .select("consumable_id, delta, unit")
    .eq("household_id", householdId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`recordedChange failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  return { itemId: row.consumable_id as string, delta: Number(row.delta ?? 0), unit: String(row.unit) };
}

/** Where an item's photo lives in the private avatars bucket. */
export function groceryPhotoPath(householdId: string, itemId: string): string {
  return `${householdId}/groceries/${itemId}`;
}

/** Recording the photo path once the upload is done (or clearing it). */
export const setGroceryImage = invalidatesContext(
  async (
    supabase: SupabaseClient,
    input: { householdId: string; itemId: string; imagePath: string | null },
  ): Promise<void> => {
    const { error } = await supabase
      .from("consumables")
      .update({ image_path: input.imagePath })
      .eq("household_id", input.householdId)
      .eq("id", input.itemId);
    if (error) refusal(error, "this item");
  },
  (_supabase, input) => input.householdId,
);

/** Items the household stopped tracking — offered as "track again" before a near-duplicate is added. */
export async function listRetiredGroceries(
  supabase: SupabaseClient,
  householdId: string,
): Promise<{ id: string; name: string; category: string }[]> {
  const { data, error } = await supabase
    .from("consumables")
    .select("id, name, category")
    .eq("household_id", householdId)
    .eq("active", false)
    .order("name")
    .limit(200);
  if (error)
    throw new Error(`listRetiredGroceries failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
  }));
}

/** "Track again": the retired item comes back with its history, rather than a second copy of it. */
export const restoreGrocery = invalidatesContext(
  async (
    supabase: SupabaseClient,
    input: { householdId: string; itemId: string },
  ): Promise<void> => {
    const { error } = await supabase
      .from("consumables")
      .update({ active: true })
      .eq("household_id", input.householdId)
      .eq("id", input.itemId);
    if (error) {
      if (error.code === "23505")
        throw ApiError.conflict(
          "Something with that name is already tracked — use that one instead.",
        );
      refusal(error, "this item");
    }
  },
  (_supabase, input) => input.householdId,
);
