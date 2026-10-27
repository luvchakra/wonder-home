import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { catalogItemFor } from "../commerce/catalog";
import { adjustListEntry, changeStock, listGroceries, markBought, type GroceryItem } from "../commerce/inventory";
import { readAcrossUnits, unitName } from "../commerce/pack-amount";
import { createConsumable, retireConsumable } from "../commerce/repository";
import { changeItemUnit } from "../commerce/unit-change";
import { bareExampleFor, bareExamples, bareRule, bareTwoReads, englishCount, readBareNumber, type BareItem } from "../commerce/bare-amount";
import { compatible, formatAmount, stepInBase, toBase, unitInfo, type Amount } from "../commerce/units";
import type { HouseholdIntent } from "./intent";
import { readItemAmount, type SpokenAmount } from "./quantity";

/**
 * HomeTalk on the Groceries list (Groceries Phase 2, story 09-011): the same
 * service the screens use (`commerce/inventory.ts`), so "add 6 more eggs" in
 * a conversation and a tap on the stepper are one write path.
 *
 *  - The list and what is at home stay separate. "Add" and "remove" change
 *    the shopping list; "we have", "used" and "bought" change what is at
 *    home — and nothing else.
 *  - "Add 6 more" adds six to what is already on the list; it never
 *    replaces it. With no amount, HomeTalk asks how much first
 *    (`quantityQuestion`, the owner, 2026-10-26); only a request that
 *    reaches here unasked (a meal's ingredients) gets one of the item's own
 *    steps.
 *  - Amounts are read by rules (`quantity.ts`), never by a model.
 *  - Every reply says the result in the item's own units, from what the
 *    database returned — never what was intended.
 */

export type GroceryLine = { item: string; amount: SpokenAmount | null; itemId?: string | null };

type Context = { supabase: SupabaseClient; householdId: string };

/** The lines an intent names, each with the amount read out of its words. */
export function linesOf(intent: HouseholdIntent): GroceryLine[] {
  if (Array.isArray(intent.parameters.lines)) {
    return (intent.parameters.lines as GroceryLine[]).filter((line) => line && typeof line.item === "string" && line.item.trim().length > 0);
  }
  const raw = Array.isArray(intent.parameters.items)
    ? (intent.parameters.items as unknown[])
    : typeof intent.parameters.items === "string"
      ? [intent.parameters.items]
      : typeof intent.parameters.item === "string"
        ? [intent.parameters.item]
        : [];
  return raw
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => {
      const read = readItemAmount(value);
      return { item: read.item || value.trim(), amount: read.amount };
    });
}

/** Lowercase, without a plural "s"/"es" — "Tomatoes" and "tomato" are the same word. */
function stem(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(?:es|s)$/, "");
}

/**
 * The tracked item a name means: its own name or an alias first, then the
 * one item whose name holds all the words said. Two equally good is null —
 * grounding asks before anything gets here.
 */
export function findGrocery(name: string, items: readonly GroceryItem[]): GroceryItem | null {
  const said = stem(name);
  const exact = items.find((item) => [item.name, ...item.aliases].some((known) => stem(known) === said));
  if (exact) return exact;
  const words = said.split(" ").filter(Boolean);
  const containing = items.filter((item) => words.every((word) => stem(item.name).split(" ").some((part) => part.startsWith(word))));
  return containing.length === 1 ? containing[0]! : null;
}

/** Items a name could mean when there is no single best — for grounding's one question. */
export function groceryCandidates(name: string, items: readonly GroceryItem[]): GroceryItem[] {
  if (findGrocery(name, items)) return [];
  const words = stem(name).split(" ").filter(Boolean);
  return items.filter((item) => words.every((word) => stem(item.name).split(" ").some((part) => part.startsWith(word))));
}

/** An amount the way a reply says it: "1.5 kg", "6 pcs", "1 bunch". */
function say(amount: Amount, preferredUnit?: string): string {
  if (amount.quantity === 0 && preferredUnit) {
    const key = unitInfo(preferredUnit).key;
    return `0 ${key === "l" ? "L" : ["g", "kg", "ml"].includes(key) ? key : englishCount(key, 0)}`;
  }
  return formatAmount(amount, "en", englishCount);
}

/** What the bare-number rule knows about an item: its own catalog entry, or what the catalog said of its name when it was made. */
export function bareItemOf(item: Pick<GroceryItem, "name" | "unit" | "step"> & { catalog?: Pick<NonNullable<GroceryItem["catalog"]>, "pack" | "category" | "subcategory" | "ladder"> | null }, named?: Named | null): BareItem {
  const catalog = item.catalog ?? (named ? { category: named.category, subcategory: null, pack: named.pack, ladder: null } : null);
  return { name: item.name, unit: item.unit, step: item.step, catalog };
}

type Named = { category: string | null; pack: Amount | null };

/**
 * The amount a line asks for, in the item's base unit. When none was said:
 * the household's own step, else the usual buy (its catalog pack, or the
 * pack the everyday kinds share — "add pasta" is a 500 g pack, 25-012),
 * else the unit's natural step. A number said with no unit is read by the
 * one bare-number rule (`commerce/bare-amount.ts`, 25-037): 2 milk is 2 L,
 * 2 eggs 2 pcs, 2 rice 2 kg — never the unit the list stores it in.
 */
function amountFor(line: GroceryLine, item: Pick<GroceryItem, "name" | "unit" | "step"> & { catalog?: Pick<NonNullable<GroceryItem["catalog"]>, "pack" | "category" | "subcategory" | "ladder"> | null }, named?: Named | null): Amount {
  if (!line.amount) {
    if (item.step && item.step > 0) return stepInBase(item.unit, item.step);
    const pack = item.catalog?.pack ?? named?.pack ?? null;
    if (pack && compatible(pack.unit, item.unit)) return toBase(pack.quantity, pack.unit);
    return stepInBase(item.unit, item.step);
  }
  if (line.amount.unit === null) {
    const read = readBareNumber(line.amount.quantity, bareItemOf(item, named));
    // Grounding asks this before anything is written; here it is the last guard.
    if (read.kind === "ask") throw ApiError.badRequest(read.question);
    return toBase(read.amount.quantity, read.amount.unit);
  }
  const unit = line.amount.unit;
  // Said in litres, kept in bottles (25-038): whole packs of a known size,
  // else the one question in words — never a unit code or "does not fit".
  const across = readAcrossUnits({ quantity: line.amount.quantity, unit }, item);
  if (across.kind === "packs") return across.amount;
  if (across.kind === "ask") throw ApiError.badRequest(across.question, { sayAsIs: true, choices: across.choices });
  return toBase(line.amount.quantity, unit);
}

/** The amount as it was said, when it was said in another unit than the item keeps ("1 L" of a bottle item). */
function saidAcross(line: GroceryLine, item: Pick<GroceryItem, "name" | "unit"> & { catalog?: Pick<NonNullable<GroceryItem["catalog"]>, "pack"> | null }): Amount | null {
  if (!line.amount?.unit) return null;
  const across = readAcrossUnits({ quantity: line.amount.quantity, unit: line.amount.unit }, item);
  return across.kind === "packs" ? across.said : null;
}

/**
 * A unit rule the database still refuses (an item changed on another screen
 * since it was read) is said in words, with what to do — never "unit does
 * not match this item" (25-038).
 */
async function inItsUnit<T>(item: Pick<GroceryItem, "name" | "unit">, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (thrown) {
    if (thrown instanceof ApiError && thrown.code === "bad_request" && /unit|amount does not fit/i.test(thrown.message)) {
      const kept = unitName(item.unit);
      throw ApiError.badRequest(`${item.name} is counted in ${kept}, so I have left it as it was. Tell me the amount in ${kept}, or change how it is counted on the Groceries screen.`, { sayAsIs: true });
    }
    throw thrown;
  }
}

function key(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function itemFor(context: Context, line: GroceryLine, items: GroceryItem[], create: boolean): Promise<{ item: GroceryItem | null; created: boolean; named?: Named | null }> {
  const known = line.itemId ? items.find((item) => item.id === line.itemId) : findGrocery(line.item, items);
  if (known || !create) return { item: known ?? null, created: false };
  // The catalog's reading of the name (25-012): "add pasta" is counted in
  // grams like pasta is, never one piece; an exact item comes with its
  // picture and nutrition. An amount the person said still decides the unit.
  const named = await catalogItemFor(context.supabase, line.item).catch(() => null);
  const said = line.amount?.unit;
  const unit = said ?? named?.unit ?? "pcs";
  const catalogId = named?.catalogId && (!said || compatible(said, named.unit)) ? named.catalogId : null;
  const category = named?.category ?? "grocery";
  const name = titleCase(line.item.trim());
  const { id } = await createConsumable(context.supabase, { householdId: context.householdId, name, category, unit, typicalQuantity: 1, catalogId });
  const fresh: GroceryItem = {
    id,
    name,
    category,
    unit: unitInfo(unit).key,
    step: null,
    lowLevel: null,
    storage: null,
    note: null,
    aliases: [],
    imageUrl: null,
    imagePath: null,
    catalog: null,
    lastPurchasedOn: null,
    updatedAt: new Date().toISOString(),
    stock: null,
    toBuy: null,
  };
  items.push(fresh);
  return { item: fresh, created: true, named: named ? { category: named.category, pack: named.pack } : null };
}

/**
 * The one question HomeTalk asks before it adds an item named with no
 * amount (the owner, 2026-10-26: "Add oil to the groceries" → "coconut oil"
 * met "already on the shopping list, so there was nothing to add"; "it
 * should ask for quantity"). An item already on the list is said with its
 * amount, and "that's enough" leaves it as it is.
 */
export function quantityQuestion(names: readonly string[], items: readonly GroceryItem[]): string {
  const known = names.map((name) => {
    const item = findGrocery(name, items);
    return { name: item?.name ?? titleCase(name.trim()), said: name.trim(), item };
  });
  if (known.length === 1) {
    const { name, item } = known[0]!;
    if (item?.toBuy) {
      return `**${name}** is already on your shopping list (${say({ quantity: item.toBuy.quantity, unit: item.toBuy.unit })}).\nHow much more should I add?\nOr say "that's enough" to leave it.`;
    }
    const counted = item && ["piece", "own"].includes(bareRule(bareItemOf(item)).kind);
    return `How ${counted ? "many" : "much"} ${name.toLowerCase()} should I add? For example ${bareExamples(item ? bareItemOf(item) : null)}.`;
  }
  // One line per item (the owner, 2026-10-26: "make the responses nicely structured").
  const listed = known.map(({ name, item }) => (item?.toBuy ? `- **${name}** — ${say({ quantity: item.toBuy.quantity, unit: item.toBuy.unit })} already on the list` : `- **${name}**`));
  const leave = known.some(({ item }) => item?.toBuy) ? `\nOr say "that's enough" to leave them.` : "";
  // Every example reads back as it says (25-037): "1 litre milk and 6 eggs",
  // and "2 of each" only when 2 is a fair amount of every one of them.
  const bare = known.map(({ item }) => (item ? bareItemOf(item) : null));
  const each = bare.every(bareTwoReads) ? `"2 of each" or ` : "";
  const examples = known.slice(0, 2).map(({ said }, index) => bareExampleFor(said, bare[index]!));
  return `How much of each should I add?\n${listed.join("\n")}\nFor example ${each}"${examples.join(" and ")}".${leave}`;
}

export type ListChangeEntry = { name: string; consumableId: string; created: boolean; delta: Amount; after: Amount; said?: Amount | null };

/** "Eggs (+6 pcs, now 12 pcs)", "Bananas (1 pc)", or both units: "Coconut oil (+1 bottle, 1 L, now 2 bottles)". */
function changeWords(entry: { name: string; delta: Amount; after: Amount; said?: Amount | null }): string {
  const after = say(entry.after);
  const delta = say(entry.delta);
  const also = entry.said ? `, ${say(entry.said)}` : "";
  return after === delta ? `**${entry.name}** (${delta}${also})` : `**${entry.name}** (+${delta}${also}, now ${after})`;
}

/**
 * "Count it in litres instead" (25-038): the item's unit changes exactly as
 * the Groceries screen changes it (`commerce/unit-change.ts`), before the
 * amount is added in it.
 */
async function switchUnitFirst(intent: HouseholdIntent, context: Context, items: GroceryItem[]): Promise<string | null> {
  const wanted = intent.parameters.switchUnit as { itemId?: unknown; unit?: unknown } | undefined;
  if (!wanted || typeof wanted.itemId !== "string" || typeof wanted.unit !== "string") return null;
  const item = items.find((entry) => entry.id === wanted.itemId);
  if (!item) return null;
  if (compatible(item.unit, wanted.unit)) return null;
  const changed = await changeItemUnit(context.supabase, {
    householdId: context.householdId,
    item: { id: item.id, unit: item.unit, step: item.step, catalog: item.catalog, onList: Boolean(item.toBuy) },
    unit: wanted.unit,
    idempotencyKey: key("ht-unit"),
  });
  if (!changed) return null;
  // What was on the list started again in the new unit: read it back as it is now.
  items.splice(0, items.length, ...(await listGroceries(context.supabase, context.householdId)));
  return `**${item.name}** is counted in ${unitName(changed.unit)} now.`;
}

/**
 * "Add 6 more eggs", "add milk and bananas", "add what pasta needs". An
 * amount always adds. A bare name is asked about first (grounding's
 * "quantity" question); "that's enough" comes back as `keepAsIs`, which
 * leaves the list as it is and says so. A bare name that reaches here
 * unasked and is already on the list is left as it is too.
 */
export async function addToShoppingList(intent: HouseholdIntent, context: Context): Promise<{ text: string; result: Record<string, unknown> }> {
  const lines = linesOf(intent);
  if (lines.length === 0) throw ApiError.badRequest("What should I add?");
  const items = await listGroceries(context.supabase, context.householdId);
  const switched = await switchUnitFirst(intent, context, items);
  const forMeal = typeof intent.parameters.forMeal === "string" ? intent.parameters.forMeal : null;
  const keepAsIs = intent.parameters.keepAsIs === true;
  const changed: ListChangeEntry[] = [];
  const there: { name: string; consumableId: string; toBuy: Amount }[] = [];
  const atHome: string[] = [];
  const leftOff: string[] = [];
  for (const line of lines) {
    // "That's enough": nothing new is made, and nothing is added for it.
    if (keepAsIs && !line.amount) {
      const { item } = await itemFor(context, line, items, false);
      if (item?.toBuy) there.push({ name: item.name, consumableId: item.id, toBuy: { quantity: item.toBuy.quantity, unit: item.toBuy.unit } });
      else leftOff.push(item?.name ?? titleCase(line.item.trim()));
      continue;
    }
    const { item, created, named } = await itemFor(context, line, items, true);
    if (!item) continue;
    // "Make sure we have everything for pasta": what is confirmed at home
    // already is not bought again. Without a confirmed amount it goes on.
    if (forMeal && item.stock && item.stock.quantity > 0 && !line.amount) {
      atHome.push(item.name);
      continue;
    }
    if (item.toBuy && !line.amount) {
      there.push({ name: item.name, consumableId: item.id, toBuy: { quantity: item.toBuy.quantity, unit: item.toBuy.unit } });
      continue;
    }
    const delta = amountFor(line, item, named);
    const result = await inItsUnit(item, () => adjustListEntry(context.supabase, { householdId: context.householdId, itemId: item.id, kind: "add", amount: delta, source: "hometalk", idempotencyKey: key("ht-add") }));
    changed.push({ name: item.name, consumableId: item.id, created, delta, after: { quantity: result.after, unit: result.unit }, said: saidAcross(line, item) });
  }
  const list = "[shopping list](/groceries?view=to-buy)";
  const names = (entries: readonly { name: string }[]) => joinAll(entries.map((entry) => `**${entry.name}**`));
  const isAre = (count: number) => (count === 1 ? "is" : "are");
  const onIt = there.length > 0 ? `${names(there)} ${isAre(there.length)} already on the ${list} (${joinAll(there.map((entry) => say(entry.toBuy)))})` : "";
  const home = atHome.length > 0 ? `${names(atHome.map((name) => ({ name })))} ${isAre(atHome.length)} already at home` : "";
  const notAdded = leftOff.length > 0 ? `I've not added ${names(leftOff.map((name) => ({ name })))}` : "";
  let text: string;
  if (keepAsIs) {
    const kept = there.length > 0 ? `${names(there)} ${isAre(there.length)} on it (${joinAll(there.map((entry) => say(entry.toBuy)))})` : "";
    const lead = changed.length > 0 ? `Added ${joinAll(changed.map(changeWords))} to the ${list}.` : `Okay, I've left the ${list} as it is.`;
    text = [lead, [kept, notAdded].filter(Boolean).join("; ")].filter(Boolean).join(" ").replace(/([^.])$/, "$1.");
  } else if (changed.length === 0) {
    const reasons = [onIt, home].filter(Boolean).join("; ");
    text = `${forMeal ? `For ${forMeal.toLowerCase()}: ` : ""}${reasons ? `${reasons}, so there was nothing to add.` : "Nothing to add."}`;
  } else if (changed.length === 1) {
    const added = `Added ${changeWords(changed[0]!)} to the ${list}`;
    text = `${forMeal ? `For ${forMeal.toLowerCase()}, I checked what is at home and on the list. ` : ""}${[added, onIt, home].filter(Boolean).join("; ")}.`;
  } else {
    // Two or more: one line each, so a phone shows a list, not a paragraph.
    const added = `Added to the ${list}:\n${changed.map((entry) => `- ${changeWords(entry)}`).join("\n")}`;
    const rest = [onIt, home].filter(Boolean).join("; ");
    text = `${forMeal ? `For ${forMeal.toLowerCase()}, I checked what is at home and on the list.\n` : ""}${added}${rest ? `\n${rest[0]!.toUpperCase()}${rest.slice(1)}.` : ""}`;
  }
  if (switched) text = `${switched}\n${text}`;
  return {
    text,
    result: {
      items: [
        ...changed.map((entry) => ({ name: entry.name, consumableId: entry.consumableId, created: entry.created, delta: entry.delta })),
        ...there.map((entry) => ({ name: entry.name, consumableId: entry.consumableId, created: false, alreadyTracked: true })),
      ],
      ...(changed.length + there.length === 1 ? { name: (changed[0] ?? there[0])!.name, consumableId: (changed[0] ?? there[0])!.consumableId } : {}),
      // Nothing written at all is the one honest "nothing to change" (§12).
      alreadyTracked: changed.length === 0,
    },
  };
}

/** "milk", "milk and bananas", "milk, eggs and bread". */
function joinAll(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "Remove the milk", "remove 500 grams of rice from the list" — the list only, never what is at home. */
export async function removeFromShoppingList(intent: HouseholdIntent, context: Context): Promise<{ text: string; result: Record<string, unknown> }> {
  const lines = linesOf(intent);
  const items = await listGroceries(context.supabase, context.householdId);
  const changed: (ListChangeEntry & { before: Amount })[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const { item } = await itemFor(context, line, items, false);
    if (!item?.toBuy) {
      missing.push(item?.name ?? titleCase(line.item));
      continue;
    }
    const before = { quantity: item.toBuy.quantity, unit: item.toBuy.unit };
    const delta = line.amount ? amountFor(line, item) : before;
    const result = await inItsUnit(item, () =>
      adjustListEntry(context.supabase, {
        householdId: context.householdId,
        itemId: item.id,
        kind: line.amount ? "subtract" : "remove",
        amount: line.amount ? delta : undefined,
        source: "hometalk",
        idempotencyKey: key("ht-remove"),
      }),
    );
    changed.push({ name: item.name, consumableId: item.id, created: false, delta, before, after: { quantity: result.after, unit: result.unit } });
  }
  const list = "[shopping list](/groceries?view=to-buy)";
  const took = changed.map((entry) =>
    entry.after.quantity > 0 ? `**${say(entry.delta)}** of **${entry.name}** off (now **${say(entry.after)}** to buy)` : `**${entry.name}** off`,
  );
  const tookLine = took.length === 0 ? "" : took.length === 1 ? `Took ${took[0]} the ${list}.` : `Took these off the ${list}:\n${took.map((entry) => `- ${entry.replace(/ off(?= \(|$)/, "")}`).join("\n")}`;
  const absent = missing.length > 0 ? `${missing.map((name) => `**${name}**`).join(", ")} ${missing.length === 1 ? "was" : "were"} not on the ${list}, so there was nothing to take off.` : "";
  return {
    text: [tookLine, absent].filter(Boolean).join(took.length > 1 ? "\n" : " "),
    result: { removed: changed.map((entry) => ({ name: entry.name, consumableId: entry.consumableId, before: entry.before, after: entry.after })), missing, alreadyTracked: changed.length === 0 },
  };
}

/** "We have 10 eggs" / "used 2 eggs" — what is at home, and only that. */
export async function changeStockFromTalk(intent: HouseholdIntent, context: Context): Promise<{ text: string; result: Record<string, unknown> }> {
  const kind = intent.action === "use_stock" ? "use" : "set";
  const lines = linesOf(intent).filter((line) => line.amount);
  if (lines.length === 0) throw ApiError.badRequest(kind === "use" ? "How much was used?" : "How much is there?");
  const items = await listGroceries(context.supabase, context.householdId);
  const said: string[] = [];
  const changes: { name: string; consumableId: string; created: boolean; kind: string; before: number | null; after: Amount }[] = [];
  for (const line of lines) {
    const { item, created, named } = await itemFor(context, line, items, kind === "set");
    if (!item) {
      said.push(`**${titleCase(line.item)}** is not something I keep track of yet, so nothing changed for it.`);
      continue;
    }
    const amount = amountFor(line, item, named);
    const result = await inItsUnit(item, () => changeStock(context.supabase, { householdId: context.householdId, itemId: item.id, kind, amount, source: kind === "use" ? "consumption" : "stated", idempotencyKey: key(`ht-${kind}`) }));
    const after = { quantity: result.after, unit: result.unit };
    changes.push({ name: item.name, consumableId: item.id, created, kind, before: result.before, after });
    if (kind === "set") {
      const onList = item.toBuy ? ` It is also on the [shopping list](/groceries?view=to-buy) (**${say({ quantity: item.toBuy.quantity, unit: item.toBuy.unit })}**). Say "remove the ${item.name.toLowerCase()}" if you no longer need it.` : "";
      said.push(`**${item.name}**: **${say(after, item.unit)}** at home now.${onList}`);
    } else {
      said.push(
        result.clamped
          ? `That was more **${item.name}** than was recorded, so there is none at home now.`
          : `Took **${say(amount)}** of **${item.name}** off what is at home, **${say(after, item.unit)}** left.`,
      );
    }
  }
  return { text: said.join(" "), result: { stock: changes } };
}

/** "Bought 2 kg potatoes and 1 litre milk" — a purchase, what is at home, and the list, once. */
export async function markBoughtFromTalk(intent: HouseholdIntent, context: Context & { today: string }): Promise<{ text: string; result: Record<string, unknown> }> {
  const lines = linesOf(intent);
  if (lines.length === 0) throw ApiError.badRequest("What was bought?");
  const items = await listGroceries(context.supabase, context.householdId);
  const said: string[] = [];
  const bought: { name: string; consumableId: string; amount: Amount; remaining: number; unit: string }[] = [];
  for (const line of lines) {
    const { item, named } = await itemFor(context, line, items, true);
    if (!item) continue;
    const amount = line.amount ? amountFor(line, item, named) : item.toBuy ? { quantity: item.toBuy.quantity, unit: item.toBuy.unit } : stepInBase(item.unit, item.step);
    // Not on the list: it goes on and comes straight off as bought, so the
    // purchase is recorded the one way every purchase is.
    let entryId = item.toBuy?.entryId ?? null;
    if (!entryId) {
      const added = await inItsUnit(item, () => adjustListEntry(context.supabase, { householdId: context.householdId, itemId: item.id, kind: "add", amount, source: "hometalk", idempotencyKey: key("ht-bought-list") }));
      entryId = added.entryId ?? null;
    }
    if (!entryId) continue;
    const result = await inItsUnit(item, () => markBought(context.supabase, { householdId: context.householdId, entryId, itemId: item.id, amount, purchasedOn: context.today, idempotencyKey: key("ht-bought") }));
    bought.push({ name: item.name, consumableId: item.id, amount, remaining: result.remaining, unit: result.unit });
    const home = result.stockAfter !== null ? ` (now **${say({ quantity: result.stockAfter, unit: result.unit })}** at home)` : "";
    const rest = result.remaining > 0 ? ` **${say({ quantity: result.remaining, unit: result.unit })}** is still on the [shopping list](/groceries?view=to-buy).` : "";
    said.push(`Recorded **${say(amount)}** of **${item.name}** bought${home}.${rest}`);
  }
  return { text: said.join(" "), result: { bought } };
}

/** Undoing an add for a correction: what HomeTalk put on the list comes off again, and an item it created is retired. */
export async function undoAddToList(result: Record<string, unknown>, context: Context): Promise<{ name: string }[] | null> {
  // Records written before the shopping list existed name one item, or carry
  // `alreadyTracked` instead of `created`; both still undo.
  const entries = (
    Array.isArray(result.items)
      ? result.items
      : typeof result.consumableId === "string"
        ? [{ name: result.name, consumableId: result.consumableId, alreadyTracked: result.alreadyTracked === true }]
        : null
  ) as { name?: unknown; consumableId?: unknown; created?: unknown; alreadyTracked?: unknown; delta?: unknown }[] | null;
  if (!entries) return null;
  const undone: { name: string }[] = [];
  for (const entry of entries) {
    if (typeof entry.consumableId !== "string") continue;
    const delta = entry.delta as Amount | undefined;
    if (delta && typeof delta.quantity === "number") {
      await adjustListEntry(context.supabase, { householdId: context.householdId, itemId: entry.consumableId, kind: "subtract", amount: delta, source: "hometalk", idempotencyKey: key("ht-undo") }).catch(() => null);
    }
    if (entry.alreadyTracked === true && entry.created !== true) continue;
    const created = entry.created === true || (entry.created === undefined && entry.alreadyTracked === false);
    if (created) await retireConsumable(context.supabase, { id: entry.consumableId, householdId: context.householdId });
    undone.push({ name: String(entry.name ?? "") });
  }
  return undone;
}

