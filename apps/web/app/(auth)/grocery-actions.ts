"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import {
  adjustListEntry,
  changeStock,
  getGroceryItem,
  groceryPhotoPath,
  listGroceries,
  markBought,
  restoreGrocery,
  setGroceryImage,
  setUseBy,
} from "@wonderhome/core/commerce/inventory";
import { catalogItemFor, searchCatalog, type CatalogEntry } from "@wonderhome/core/commerce/catalog";
import { baseOf } from "@wonderhome/core/commerce/buying-sizes";
import { householdItemForCatalog } from "@wonderhome/core/commerce/catalog-items";
import { changeItemUnit } from "@wonderhome/core/commerce/unit-change";
import {
  createConsumable,
  retireConsumable,
  updateConsumable,
} from "@wonderhome/core/commerce/repository";
import {
  compatible,
  normalizeUnit,
  parseQuantity,
  stepInBase,
  toBase,
} from "@wonderhome/core/commerce/units";
import { publicEnv } from "@wonderhome/core/config/env";
import { similarity } from "@wonderhome/core/context/normalize";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

import { deletePhoto, postedPhoto, storePhoto } from "../_lib/photos";
import type { ActionState } from "./actions";

/**
 * Groceries Phase 1's writes (design/GROCERIES-PANTRY-HOMETALK-PHASE0.md §3–§4).
 *
 * Every amount goes through `commerce/inventory.ts` — the same service
 * HomeTalk will call — under the member's own session, so the database's
 * functions decide who may change what (adults the stock, the family the
 * list, helpers neither). The browser sends an idempotency key with each
 * change, so a retried tap never counts twice.
 */

const uuid = z.uuid();
const key = z.string().regex(/^[A-Za-z0-9:_-]{8,120}$/);
const amount = z.number().min(0).max(1_000_000);
const unit = z.string().trim().min(1).max(20);

export type AmountResult =
  | {
      ok: true;
      after: number;
      unit: string;
      version: number;
      clamped?: boolean;
      conflict?: boolean;
    }
  | { ok: false; error: string };

function failed(thrown: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: toErrorBody(thrown, "commerce").body.error.message,
  };
}

const listSchema = z.object({
  householdId: uuid,
  itemId: uuid,
  kind: z.enum(["add", "subtract", "set", "remove"]),
  quantity: amount.optional(),
  unit: unit.optional(),
  key,
  expectedVersion: z.number().int().nonnegative().nullable().optional(),
});

/** The to-buy stepper and its "type an amount" sheet. */
export async function adjustListAction(
  input: z.input<typeof listSchema>,
): Promise<AmountResult> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "That amount could not be read." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const result = await adjustListEntry(supabase, {
      householdId: parsed.data.householdId,
      itemId: parsed.data.itemId,
      kind: parsed.data.kind,
      amount:
        parsed.data.quantity !== undefined && parsed.data.unit
          ? { quantity: parsed.data.quantity, unit: parsed.data.unit }
          : undefined,
      source: "manual",
      idempotencyKey: parsed.data.key,
      expectedVersion: parsed.data.expectedVersion ?? null,
    });
    revalidatePath("/groceries");
    return {
      ok: true,
      after: result.after,
      unit: result.unit,
      version: result.version,
      conflict: result.conflict,
    };
  } catch (thrown) {
    return failed(thrown);
  }
}

export type UnitChangeState =
  | { ok: true; unit: string; stockCleared: number | null; listAfter: number | null; converts: boolean }
  | { ok: false; error: string };

/**
 * "Count it in grams" (25-012): how an item is counted, from the amount
 * sheet. A unit that does not convert puts what is at home back to not
 * counted, and starts the list amount again at the usual buy — the result
 * says which, so the sheet can tell the person.
 */
export async function changeUnitAction(input: { householdId: string; itemId: string; unit: string; key: string }): Promise<UnitChangeState> {
  const parsed = z.object({ householdId: uuid, itemId: uuid, unit, key }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That unit could not be used." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const item = await getGroceryItem(supabase, parsed.data.householdId, parsed.data.itemId);
    if (!item) return { ok: false, error: "That item is not on record in this household." };
    const changed = await changeItemUnit(supabase, {
      householdId: parsed.data.householdId,
      item: { id: item.id, unit: item.unit, step: item.step, catalog: item.catalog, onList: item.toBuy !== null },
      unit: parsed.data.unit,
      idempotencyKey: parsed.data.key,
    });
    revalidatePath("/groceries");
    revalidatePath(`/groceries/${item.id}`);
    return changed
      ? { ok: true, ...changed }
      : { ok: true, unit: item.unit, stockCleared: null, listAfter: item.toBuy?.quantity ?? null, converts: true };
  } catch (thrown) {
    return { ok: false, error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

const stockSchema = z.object({
  householdId: uuid,
  itemId: uuid,
  kind: z.enum(["set", "add", "use"]),
  quantity: amount,
  unit,
  key,
  expectedVersion: z.number().int().nonnegative().nullable().optional(),
});

/** "Update stock" on an item's page — the only way the row's IN STOCK number changes by hand. */
export async function changeStockAction(
  input: z.input<typeof stockSchema>,
): Promise<AmountResult> {
  const parsed = stockSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "That amount could not be read." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const result = await changeStock(supabase, {
      householdId: parsed.data.householdId,
      itemId: parsed.data.itemId,
      kind: parsed.data.kind,
      amount: { quantity: parsed.data.quantity, unit: parsed.data.unit },
      source: parsed.data.kind === "use" ? "consumption" : "stated",
      idempotencyKey: parsed.data.key,
      expectedVersion: parsed.data.expectedVersion ?? null,
    });
    revalidatePath("/groceries");
    revalidatePath(`/groceries/${parsed.data.itemId}`);
    return {
      ok: true,
      after: result.after,
      unit: result.unit,
      version: result.version,
      clamped: result.clamped,
      conflict: result.conflict,
    };
  } catch (thrown) {
    return failed(thrown);
  }
}

const boughtSchema = z.object({
  householdId: uuid,
  purchasedOn: z.iso.date(),
  key,
  lines: z
    .array(
      z.object({
        entryId: uuid,
        itemId: uuid,
        quantity: amount.positive(),
        unit,
      }),
    )
    .min(1)
    .max(100),
});

export type BoughtResult =
  | { ok: true; recorded: number; stillToBuy: number }
  | { ok: false; error: string; recorded: number };

/** "Mark bought": each line's actual amount goes into a purchase and onto what is at home, once. */
export async function markBoughtAction(
  input: z.input<typeof boughtSchema>,
): Promise<BoughtResult> {
  const parsed = boughtSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Say how much of each was bought.",
      recorded: 0,
    };
  const supabase = await createClient();
  let recorded = 0;
  let stillToBuy = 0;
  try {
    await requireMembership(supabase, parsed.data.householdId);
    for (const line of parsed.data.lines) {
      const result = await markBought(supabase, {
        householdId: parsed.data.householdId,
        entryId: line.entryId,
        itemId: line.itemId,
        amount: { quantity: line.quantity, unit: line.unit },
        purchasedOn: parsed.data.purchasedOn,
        idempotencyKey: `${parsed.data.key}:${line.entryId}`,
      });
      recorded += 1;
      if (result.remaining > 0) stillToBuy += 1;
    }
    revalidatePath("/groceries");
    return { ok: true, recorded, stillToBuy };
  } catch (thrown) {
    // What was recorded stays recorded and is said so; nothing is claimed for the rest.
    revalidatePath("/groceries");
    return { ...failed(thrown), recorded };
  }
}

const useBySchema = z.object({
  householdId: uuid,
  itemId: uuid,
  useBy: z.union([z.iso.date(), z.literal("")]),
});

/** A use-by date someone read off the pack. */
export async function setUseByAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = useBySchema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    useBy: formData.get("clear") === "1" ? "" : (formData.get("useBy") ?? ""),
  });
  if (!parsed.success) return { error: "That date could not be read." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await setUseBy(supabase, {
      householdId: parsed.data.householdId,
      itemId: parsed.data.itemId,
      useBy: parsed.data.useBy || null,
    });
    revalidatePath(`/groceries/${parsed.data.itemId}`);
    revalidatePath("/groceries");
    return {
      notice: parsed.data.useBy ? "Use-by date saved." : "Use-by date cleared.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

const addSchema = z.object({
  householdId: uuid,
  name: z.string().trim().min(1, { error: "What is it?" }).max(120),
  category: z.string().trim().min(1, { error: "Pick a category." }).max(40),
  unit,
  toBuy: z.string().optional(),
  inStock: z.string().optional(),
  confirmNew: z.string().optional(),
});

export type AddItemState = ActionState & {
  duplicate?: { id: string; name: string };
  addedId?: string;
};

/**
 * A new item, after the search: refused as a near-duplicate of something
 * already tracked unless the person says it really is different, and given
 * its first amounts when they were typed.
 */
export async function addGroceryItemAction(
  _previous: AddItemState,
  formData: FormData,
): Promise<AddItemState> {
  const parsed = addSchema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    toBuy: formData.get("toBuy") ?? undefined,
    inStock: formData.get("inStock") ?? undefined,
    confirmNew: formData.get("confirmNew") ?? undefined,
  });
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  const { householdId, name, category } = parsed.data;
  const preferred = normalizeUnit(parsed.data.unit) ?? "pcs";
  const toBuy = parsed.data.toBuy ? parseQuantity(parsed.data.toBuy) : null;
  const inStock = parsed.data.inStock
    ? parseQuantity(parsed.data.inStock)
    : null;
  if (parsed.data.toBuy && toBuy === null)
    return { error: "The amount to buy could not be read." };
  if (parsed.data.inStock && inStock === null)
    return { error: "The amount at home could not be read." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    if (parsed.data.confirmNew !== "1") {
      const existing = await listGroceries(supabase, householdId);
      const near = existing.find((item) =>
        [item.name, ...item.aliases].some(
          (known) => similarity(known, name) >= 0.8,
        ),
      );
      if (near) return { duplicate: { id: near.id, name: near.name } };
    }

    // An exact catalog name or alias brings the catalog's picture and nutrition with it, as HomeTalk's adds do;
    // only when it is counted the same way as the unit picked here.
    const named = await catalogItemFor(supabase, name).catch(() => null);
    const catalogId = named?.catalogId && baseOf(named.unit).unit === baseOf(preferred).unit ? named.catalogId : null;
    const { id } = await createConsumable(supabase, {
      householdId,
      name,
      category,
      unit: preferred,
      typicalQuantity: 1,
      catalogId,
    });
    const seed = `add-${id}`;
    if (toBuy && toBuy > 0) {
      await adjustListEntry(supabase, {
        householdId,
        itemId: id,
        kind: "add",
        amount: { quantity: toBuy, unit: preferred },
        source: "manual",
        idempotencyKey: `${seed}:list`,
      });
    }
    if (inStock !== null) {
      await changeStock(supabase, {
        householdId,
        itemId: id,
        kind: "set",
        amount: { quantity: inStock, unit: preferred },
        source: "stated",
        idempotencyKey: `${seed}:stock`,
      });
    }
    revalidatePath("/groceries");
    return { notice: "Added.", addedId: id };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

/** "Track again" — a retired item comes back with its history. */
export async function restoreGroceryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ householdId: uuid, itemId: uuid })
    .safeParse({
      householdId: formData.get("householdId"),
      itemId: formData.get("itemId"),
    });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await restoreGrocery(supabase, parsed.data);
    revalidatePath("/groceries");
    return { notice: "Tracked again." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

const detailsSchema = z.object({
  householdId: uuid,
  itemId: uuid,
  name: z.string().trim().min(1, { error: "What is it?" }).max(120),
  category: z.string().trim().min(1, { error: "Pick a category." }).max(40),
  unit,
  step: z.string().optional(),
  lowLevel: z.string().optional(),
  storage: z.enum(["", "fridge", "freezer", "pantry", "other"]).optional(),
  note: z.string().max(300).optional(),
  aliases: z.string().max(400).optional(),
  typicalQuantity: z.coerce.number().positive().max(1_000_000),
  daysPerUnit: z
    .union([z.coerce.number().positive().max(3650), z.literal("")])
    .optional(),
});

/** Everything about an item other than its amounts, from its own page. */
export async function updateGroceryItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const field = (name: string) =>
    (formData.get(name) as string | null) ?? undefined;
  const parsed = detailsSchema.safeParse({
    householdId: field("householdId"),
    itemId: field("itemId"),
    name: field("name"),
    category: field("category"),
    unit: field("unit"),
    step: field("step"),
    lowLevel: field("lowLevel"),
    storage: field("storage") ?? "",
    note: field("note"),
    aliases: field("aliases"),
    typicalQuantity: field("typicalQuantity") || 1,
    daysPerUnit: field("daysPerUnit") || undefined,
  });
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  const step = parsed.data.step ? parseQuantity(parsed.data.step) : null;
  const lowLevel = parsed.data.lowLevel
    ? parseQuantity(parsed.data.lowLevel)
    : null;
  if (parsed.data.step && !step)
    return { error: "The step could not be read." };
  if (parsed.data.lowLevel && lowLevel === null)
    return { error: "The low level could not be read." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const preferred = normalizeUnit(parsed.data.unit) ?? "pcs";
    // A new unit goes through the one path that knows what to do with the
    // amounts (25-012), even when it does not convert; the step typed
    // beside it is then in the new unit, unless it was left as it was.
    const before = await getGroceryItem(supabase, parsed.data.householdId, parsed.data.itemId);
    let carriedStep: number | null | undefined;
    if (before && normalizeUnit(before.unit) !== preferred) {
      const changed = await changeItemUnit(supabase, {
        householdId: parsed.data.householdId,
        item: { id: before.id, unit: before.unit, step: before.step, catalog: before.catalog, onList: before.toBuy !== null },
        unit: preferred,
        idempotencyKey: `unit-${parsed.data.itemId}-${globalThis.crypto.randomUUID()}`,
      });
      if (changed && (step ?? null) === (before.step ?? null)) {
        const after = await getGroceryItem(supabase, parsed.data.householdId, parsed.data.itemId);
        carriedStep = after?.step ?? null;
      }
    }
    await updateConsumable(supabase, {
      id: parsed.data.itemId,
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      category: parsed.data.category,
      unit: preferred,
      typicalQuantity: parsed.data.typicalQuantity,
      daysPerUnit:
        parsed.data.daysPerUnit === "" || parsed.data.daysPerUnit === undefined
          ? null
          : parsed.data.daysPerUnit,
      step: carriedStep !== undefined ? carriedStep : step || null,
      // The low level is typed in the item's own unit and kept in base units, like stock.
      lowLevel: lowLevel === null ? null : toBase(lowLevel, preferred).quantity,
      storage: parsed.data.storage ? parsed.data.storage : null,
      note: parsed.data.note ?? null,
      aliases: (parsed.data.aliases ?? "")
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean),
    });
    revalidatePath("/groceries");
    revalidatePath(`/groceries/${parsed.data.itemId}`);
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

/** Swipe-to-remove on the All list: stop tracking without leaving the page. History stays; "Track again" brings it back. */
export async function retireGroceryItemAction(input: { householdId: string; itemId: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ householdId: uuid, itemId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await retireConsumable(supabase, { id: parsed.data.itemId, householdId: parsed.data.householdId });
    revalidatePath("/groceries");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Stop tracking, from the item's page — back to the list afterwards. Its history stays. */
export async function stopTrackingGroceryAction(
  formData: FormData,
): Promise<void> {
  const parsed = z
    .object({ householdId: uuid, itemId: uuid })
    .safeParse({
      householdId: formData.get("householdId"),
      itemId: formData.get("itemId"),
    });
  if (!parsed.success) return;
  const supabase = await createClient();
  await requireMembership(supabase, parsed.data.householdId);
  await retireConsumable(supabase, {
    id: parsed.data.itemId,
    householdId: parsed.data.householdId,
  });
  revalidatePath("/groceries");
  redirect("/groceries");
}

/** The household's own photo of an item, kept in the private avatars bucket. */
export async function groceryPhotoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ householdId: uuid, itemId: uuid })
    .safeParse({
      householdId: formData.get("householdId"),
      itemId: formData.get("itemId"),
    });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const path = groceryPhotoPath(parsed.data.householdId, parsed.data.itemId);
    if (formData.get("remove") === "1") {
      await deletePhoto(supabase, path);
      await setGroceryImage(supabase, { ...parsed.data, imagePath: null });
      revalidatePath(`/groceries/${parsed.data.itemId}`);
      revalidatePath("/groceries");
      return { notice: "Photo removed." };
    }
    const photo = await postedPhoto(formData, "photo");
    if (!photo) return { error: "Choose a photo first." };
    await storePhoto(supabase, path, photo);
    await setGroceryImage(supabase, { ...parsed.data, imagePath: path });
    revalidatePath(`/groceries/${parsed.data.itemId}`);
    revalidatePath("/groceries");
    return { notice: "Photo updated." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

export type CatalogResult = { ok: true; entries: CatalogEntry[] } | { ok: false };

/**
 * The shared catalog for what someone typed in Add an item (HomeFood 25-006):
 * pictures, names, brands and packs, like a quick-commerce search. Reads only.
 */
export async function searchCatalogAction(householdId: string, query: string): Promise<CatalogResult> {
  const parsed = z.object({ householdId: uuid, query: z.string().trim().min(2).max(60) }).safeParse({ householdId, query });
  if (!parsed.success) return { ok: true, entries: [] };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const entries = await searchCatalog(supabase, parsed.data.query, { supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });
    return { ok: true, entries };
  } catch {
    return { ok: false };
  }
}

export type CatalogAddResult = { ok: true; itemId: string; name: string; created: boolean } | { ok: false; error: string };

/**
 * Adds a catalog entry to the household's list: the household's own item for
 * it if there is one — linked to the entry, or plainly the same name — else a
 * new item made from the entry (name, category, unit, linked), then one pack
 * to buy. The entry is read again here; the browser names only its id.
 */
export async function addFromCatalogAction(input: {
  householdId: string;
  catalogId: string;
  /** What the person chose on the item's ladder; the usual buy when absent. */
  amount?: { quantity: number; unit: string };
  key: string;
}): Promise<CatalogAddResult> {
  const parsed = z
    .object({
      householdId: uuid,
      catalogId: uuid,
      amount: z.object({ quantity: z.number().positive().max(1_000_000), unit: z.string().trim().min(1).max(20) }).optional(),
      key,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please try again." };
  const { householdId, catalogId } = parsed.data;
  try {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);
    // The same rule a recipe's ingredient rows use (`householdItemForCatalog`).
    const found = await householdItemForCatalog(supabase, { householdId, catalogId, supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });
    if (!found) return { ok: false, error: "That item is no longer in the catalog." };
    const { entry, existing, created } = found;
    const name = entry.name;
    const itemId = found.item.id;
    const preferred = existing?.unit ?? entry.unit;
    const chosen = parsed.data.amount;
    if (chosen && !compatible(chosen.unit, preferred)) return { ok: false, error: "That amount doesn't fit how this item is counted." };
    const amount = chosen ?? (entry.pack && compatible(entry.pack.unit, preferred) ? entry.pack : stepInBase(preferred, existing?.step ?? null));
    await adjustListEntry(supabase, { householdId, itemId, kind: "add", amount, source: "manual", idempotencyKey: `${parsed.data.key}:list` });
    revalidatePath("/groceries");
    return { ok: true, itemId, name: existing?.name ?? name, created };
  } catch (thrown) {
    return failed(thrown);
  }
}
