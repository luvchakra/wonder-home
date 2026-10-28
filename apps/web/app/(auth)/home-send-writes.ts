import { revalidatePath } from "next/cache";
import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { CONSUMABLE_CATEGORIES } from "@wonderhome/core/commerce/consumables";
import { catalogItemFor } from "@wonderhome/core/commerce/catalog";
import { baseOf } from "@wonderhome/core/commerce/buying-sizes";
import { adjustListEntry, changeStock, listGroceries, type GroceryItem } from "@wonderhome/core/commerce/inventory";
import { createConsumable, listConsumables, recordPurchase } from "@wonderhome/core/commerce/repository";
import type { Amount } from "@wonderhome/core/commerce/units";
import { receiptStockLine } from "@wonderhome/core/commerce/receipt-stock";
import { currencyCode, unitCostMinor } from "@wonderhome/core/commerce/receipts";
import { recordHomeSendChange } from "@wonderhome/core/homesend/changes";
import { similarity } from "@wonderhome/core/context/normalize";
import { findGrocery } from "@wonderhome/core/conversation/grocery-actions";
import { billShape, eventShape, groceryAmount, groceryShape } from "@wonderhome/core/homesend/record-types";
import type { createClient } from "@wonderhome/core/db/server";
import { OBLIGATION_KINDS } from "@wonderhome/core/finance/payments";
import { cancelObligation, createObligation, listObligations, updateObligation } from "@wonderhome/core/finance/repository";
import { createRecord, RECORD_TYPES } from "@wonderhome/core/health/records";
import { listDetails, missingRequired } from "@wonderhome/core/homesend/completeness";
import { HOME_SEND_REVIEW_PROPOSALS, HOME_SEND_REVIEW_SUBJECTS } from "@wonderhome/core/homesend/items";
import { getHomeSendItem } from "@wonderhome/core/homesend/repository";
import { createChildMember } from "@wonderhome/core/identity/children";
import { requireHouseholdAdmin, type requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { ACTIVITY_ITEM_KINDS } from "@wonderhome/core/ai/classify-intake";
import { addFamilyEvent, addSchoolItem } from "@wonderhome/core/calendar/add-event";
import { zonedTimeToUtcIso } from "@wonderhome/core/conversation/executor";
import type { HomeSendChangeDomain } from "@wonderhome/core/homesend/items";
import { listActivities, sameActivityName, saveActivity, saveActivityNote } from "@wonderhome/core/school/activities";
import { cancelSchoolItem, listSchoolItems, updateSchoolItem } from "@wonderhome/core/school/repository";
import { movedSchoolWhen, schoolWhen } from "@wonderhome/core/school/times";

/**
 * The writes HomeSend makes into a domain, through that domain's own
 * governed service (Wave 3 §10–11, DDU 2.0 §38) — shared by the one-item
 * confirm (`home-send-actions.ts`) and the document plan
 * (`home-send-plan-actions.ts`).
 *
 * Deliberately not a "use server" module: nothing here is callable from a
 * browser. Each caller validates, authorizes and decides first; these only
 * perform the write it decided on.
 */

export const routeSchema = z.object({
  householdId: z.uuid(),
  itemId: z.uuid(),
  /**
   * What the person decided (Wave 3 §10, §13): add it as new, update or
   * cancel the record it matched, or keep the existing one and change
   * nothing. The last three only ever act on `existingId`, which the server
   * re-checks is part of this household before touching it.
   */
  decision: z.enum(["add", "update", "cancel", "keep"]).default("add"),
  existingId: z.uuid().optional(),
  kind: z.enum(["bill", "school_item", "activity_item", "event", "grocery_item", "health_document"]),
  title: z.string().trim().min(1, { error: "What is it?" }).max(160),
  notes: z.string().trim().max(2000).optional(),
  // event — where it happens, the calendar's "Where".
  location: z.string().trim().max(200).optional(),
  // bill
  billKind: z.enum(OBLIGATION_KINDS).optional(),
  payee: z.string().trim().max(120).optional(),
  amount: z.union([z.coerce.number().min(0).max(10_000_000), z.literal("")]).optional(),
  currency: z.string().trim().max(8).optional(),
  dueDate: z.string().optional(),
  // school — a local start and end ("HH:MM"); empty means all day.
  dueTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
  endTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
  // A child already on record, or "new": a child the notice names who is not
  // on record yet, added in the same step (story 08-009).
  childMemberId: z.union([z.uuid(), z.literal("new")]).optional(),
  newChildName: z.string().trim().min(1, { error: "What is the child's name?" }).max(80).optional(),
  newChildDob: z.union([z.iso.date(), z.literal("")]).optional(),
  schoolKind: z.enum(SCHOOL_ITEM_KINDS).optional(),
  subject: z.string().trim().max(60).optional(),
  // activity_item — what the class has on the day, and which class it is
  // (one of the child's own, picked; or a new one, added in the same step).
  activityKind: z.enum(ACTIVITY_ITEM_KINDS).optional(),
  activityName: z.string().trim().max(120).optional(),
  // grocery
  quantity: z.union([z.coerce.number().min(0.01).max(10_000), z.literal("")]).optional(),
  unit: z.string().trim().max(40).optional(),
  category: z.string().trim().max(40).optional(),
  // health_document — subjectMemberId empty/omitted means "for me" (see
  // routing below): the extracted subjectMemberName is only ever a hint
  // shown beside this picker, never trusted to select an identity itself.
  subjectMemberId: z.uuid().optional(),
  healthRecordType: z.enum(RECORD_TYPES).optional(),
  documentDate: z.string().optional(),
  // Needs the same content implies (§11): each ticked one becomes its own
  // grocery row, separately undoable. Nothing unticked is ever written.
  needs: z.array(z.string().trim().min(1).max(160)).max(5).default([]),
  // Set once the person has seen a reconciliation candidate and said this
  // really is a different one.
  confirmDuplicate: z.literal("on").optional(),
  // What the review showed (§19's metrics): the reconciliation it offered
  // and whether "who is this for" had to be asked. Closed words only; they
  // describe the review, never decide anything.
  proposal: z.enum(HOME_SEND_REVIEW_PROPOSALS).optional(),
  subjectState: z.enum(HOME_SEND_REVIEW_SUBJECTS).optional(),
});

export type RouteInput = z.infer<typeof routeSchema>;

export type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Membership = Awaited<ReturnType<typeof requireMembership>>;

/**
 * Updating or cancelling a record already on record (§10) — through the same
 * governed service a manual edit or remove uses, keeping what it replaced so
 * undo can put it back exactly.
 */
export async function reviseExisting(
  supabase: Supabase,
  membership: Membership,
  input: RouteInput & { existingId: string; decision: "update" | "cancel" },
): Promise<{ routedTable: string; routedId: string; changeType: "updated" | "cancelled"; previous: Record<string, unknown>; domain: "bill" | "school_item" }> {
  const householdId = input.householdId;
  if (input.kind === "school_item") {
    const existing = (await listSchoolItems(supabase, householdId, { id: input.existingId }))[0];
    if (!existing) throw new Error("existing school item not found");
    const previous = { dueAt: existing.dueAt?.toISOString() ?? null, dueTimeKnown: existing.dueTimeKnown, endsAt: existing.endsAt?.toISOString() ?? null, status: existing.status };
    if (input.decision === "cancel") {
      await cancelSchoolItem(supabase, householdId, existing.id);
      return { routedTable: "school_items", routedId: existing.id, changeType: "cancelled", previous, domain: "school_item" };
    }
    // A new time from the notice wins; otherwise a moved day keeps the time it had (14-014).
    const timezone = membership.household.timezone;
    const when = !input.dueDate
      ? { dueAt: previous.dueAt, dueTimeKnown: existing.dueTimeKnown, endsAt: previous.endsAt }
      : input.dueTime
        ? schoolWhen({ date: input.dueDate, time: input.dueTime, endTime: input.endTime, timezone })
        : movedSchoolWhen(existing, input.dueDate, timezone);
    await updateSchoolItem(supabase, householdId, existing.id, when);
    return { routedTable: "school_items", routedId: existing.id, changeType: "updated", previous, domain: "school_item" };
  }
  if (input.kind === "bill") {
    const existing = (await listObligations(supabase, householdId, { id: input.existingId }))[0];
    if (!existing) throw new Error("existing bill not found");
    const previous = { dueOn: existing.dueOn, amountMinor: existing.amountMinor, status: existing.status };
    if (input.decision === "cancel") {
      await cancelObligation(supabase, { id: existing.id, householdId });
      return { routedTable: "obligations", routedId: existing.id, changeType: "cancelled", previous, domain: "bill" };
    }
    await updateObligation(supabase, {
      id: existing.id,
      householdId,
      dueOn: input.dueDate || existing.dueOn,
      amountMinor: input.amount ? Math.round(Number(input.amount) * 100) : existing.amountMinor,
      // An amount needs its currency: the document's, else the one the bill already had.
      ...(input.amount ? { currency: input.currency || existing.currency || null } : {}),
    });
    return { routedTable: "obligations", routedId: existing.id, changeType: "updated", previous, domain: "bill" };
  }
  throw new Error("only a bill or a school item can be updated or cancelled from HomeSend");
}

export async function addChildFromNotice(supabase: Supabase, input: RouteInput): Promise<{ memberId: string } | { error: string }> {
  if (!input.newChildName) return { error: "What is the child's name?" };
  let actor: Membership;
  try {
    actor = await requireHouseholdAdmin(supabase, input.householdId);
  } catch {
    return { error: "Only an Admin can add a child. Ask one to add them from Family, then confirm this for them." };
  }
  try {
    const added = await createChildMember(supabase, {
      householdId: input.householdId,
      displayName: input.newChildName,
      dateOfBirth: input.newChildDob || null,
      guardianMemberIds: [actor.memberId],
    });
    revalidatePath("/family");
    revalidatePath("/school");
    return added;
  } catch (thrown) {
    log.warn("adding a child from a school notice failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return { error: "We could not add that child. Nothing was saved — please try again." };
  }
}

/**
 * What a confirm wrote: its record, and anything it had to add first for it
 * (a class the child did not have yet), each undone on its own. `previous` is
 * set when it changed a record already there instead of adding one (a
 * grocery already tracked, put on To buy), so undo takes back only that.
 */
export type Created = {
  routedTable: string;
  routedId: string;
  also?: { domain: HomeSendChangeDomain; entityId: string }[];
  changeType?: "created" | "updated";
  previous?: Record<string, unknown>;
  /** A grocery that was on the shopping list already: what this added, and what the list says now (I-27). */
  more?: { added: Amount; now: Amount };
};

/**
 * The tracked item a HomeSend grocery goes onto: the one HomeTalk's add would
 * pick (its name or alias, then the one holding every word said), so two
 * entries that look alike never get a third (I-27); else the closest by spelling.
 */
export function trackedGrocery(name: string, groceries: readonly GroceryItem[]): GroceryItem | null {
  return findGrocery(name, groceries) ?? groceries.find((item) => [item.name, ...item.aliases].some((known) => similarity(known, name) >= 0.8)) ?? null;
}

/**
 * A grocery as Groceries' own Add files it (the owner, 2026-10-25: aligned to
 * the entity already there): an item already tracked by that name is the one
 * put on To buy, never a second copy; a new one gets the catalog's entry
 * (picture, nutrition) when its name is in the catalog and it is counted the
 * same way, then goes on To buy. The list change carries a key, so undo takes
 * back exactly what this added.
 */
export async function addGrocery(
  supabase: Supabase,
  householdId: string,
  said: { title: string; quantity?: number | string | null; unit?: string | null; category?: string | null },
  key: string,
): Promise<Created> {
  const shape = groceryShape(said);
  const listKey = `hs:${key}:list`;
  const tracked = trackedGrocery(shape.name, await listGroceries(supabase, householdId));
  if (tracked) {
    // A number alone is the item's practical amount (25-037): 2 milk is 2 L, never 2 ml.
    const amount = groceryAmount(said, tracked);
    const result = await adjustListEntry(supabase, { householdId, itemId: tracked.id, kind: "add", amount, source: "manual", idempotencyKey: listKey });
    const more = tracked.toBuy && tracked.toBuy.quantity > 0 ? { more: { added: amount, now: { quantity: result.after, unit: result.unit } } } : {};
    return { routedTable: "consumables", routedId: tracked.id, changeType: "updated", previous: { listKey }, ...more };
  }
  const named = await catalogItemFor(supabase, shape.name).catch(() => null);
  // No unit said: kept the way the catalog keeps it, and the number read by its practical unit (25-037).
  const unit = !said.unit?.trim() && named ? named.unit : shape.unit;
  const catalogId = named?.catalogId && baseOf(named.unit).unit === baseOf(unit).unit ? named.catalogId : null;
  const category = said.category && (CONSUMABLE_CATEGORIES as readonly string[]).includes(said.category) ? said.category : CONSUMABLE_CATEGORIES[0];
  const { id } = await createConsumable(supabase, { householdId, name: shape.name, category, unit, typicalQuantity: 1, catalogId });
  const amount = groceryAmount(said, { name: shape.name, unit, catalog: named ? { category: named.category, pack: named.pack } : null });
  await adjustListEntry(supabase, { householdId, itemId: id, kind: "add", amount, source: "manual", idempotencyKey: listKey });
  return { routedTable: "consumables", routedId: id, changeType: "created" };
}

export async function createNew(supabase: Supabase, membership: Membership, input: RouteInput): Promise<Created | { error: string }> {
  const householdId = input.householdId;
  // What it can't be added without (`homesend/completeness.ts`): the review keeps Add off, and a post that skips it is refused here.
  // Who it is for is checked per kind below, with its own words.
  const missing = missingRequired(
    input.kind,
    {
      title: input.title,
      dueDate: input.dueDate || null,
      subject: input.activityName || input.subject || null,
      payee: input.payee || null,
      amount: typeof input.amount === "number" ? input.amount : null,
      healthRecordType: input.healthRecordType ?? "other",
    },
    { person: true },
  );
  if (missing.length > 0) return { error: `Still needed: ${listDetails(missing)}.` };
  if (input.kind === "activity_item") {
    if (!input.childMemberId || input.childMemberId === "new") return { error: "Choose who this is for." };
    const childMemberId = input.childMemberId;
    const name = (input.activityName || input.subject || "").trim();
    if (!name) return { error: "Which class or activity is it?" };
    // Filed under the child's own class of that name, through Kids & School's
    // services; a class the child does not have yet is added in the same step
    // and undone with it.
    const classes = (await listActivities(supabase, householdId)).filter((activity) => activity.childMemberId === childMemberId);
    const existing = classes.find((activity) => sameActivityName(activity.name, name));
    const kind = input.activityKind ?? "event";
    if (existing && input.dueDate && existing.items.some((item) => item.onDate === input.dueDate && item.title.trim().toLowerCase() === input.title.trim().toLowerCase())) {
      return { error: `“${input.title}” is already on ${existing.name} that day, so this was not added again.` };
    }
    const also: NonNullable<Created["also"]> = [];
    let activityId = existing?.id;
    if (!activityId) {
      const added = await saveActivity(supabase, { householdId, childMemberId, name, kind: "other", days: [], startsAt: null, endsAt: null });
      activityId = added.id;
      also.push({ domain: "activity", entityId: added.id });
    }
    const note = await saveActivityNote(supabase, {
      householdId,
      activityId,
      kind,
      title: input.title,
      onDate: input.dueDate || null,
      startsAt: kind === "note" ? null : input.dueTime || null,
      endsAt: kind === "note" ? null : input.endTime || null,
      detail: input.notes || null,
    });
    return { routedTable: "child_activity_notes", routedId: note.id, also };
  }
  if (input.kind === "event") {
    if (!input.dueDate) return { error: "Which day is it?" };
    const timeZone = membership.household.timezone;
    const at = (time: string) => zonedTimeToUtcIso(input.dueDate!, Number(time.slice(0, 2)), Number(time.slice(3, 5)), timeZone);
    const startsAt = at(input.dueTime || "00:00");
    const endsAt = input.dueTime
      ? input.endTime && input.endTime > input.dueTime
        ? at(input.endTime)
        : new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString()
      : new Date(new Date(startsAt).getTime() + 24 * 60 * 60_000).toISOString();
    // Through HomeEvents' one door: the same thing already on the calendar
    // that day is said back, never added a second time. Filed the way the
    // calendar's own Add files it: its kind and category, and where it is.
    const shape = eventShape({ title: input.title, notes: input.notes });
    const added = await addFamilyEvent(
      supabase,
      {
        householdId,
        title: input.title,
        kind: shape.kind,
        category: shape.category,
        startsAt,
        endsAt,
        allDay: !input.dueTime,
        timeZone,
        location: input.location || null,
        ownerMemberId: membership.memberId,
        notes: input.notes || null,
      },
      { timeZone },
    );
    if (added.kind === "duplicate") return { error: `“${added.existing.title}” is already on the calendar that day, so this was not added again.` };
    return { routedTable: "family_events", routedId: added.id };
  }
  if (input.kind === "bill") {
    // The type and cadence the Bills screen's picker would give it.
    const shape = billShape({ title: input.title, payee: input.payee, kind: input.billKind ?? null });
    const created = await createObligation(supabase, {
      householdId,
      name: input.title,
      kind: shape.kind,
      billType: shape.billType,
      recurrence: shape.recurrence,
      payee: input.payee || null,
      amountMinor: input.amount ? Math.round(Number(input.amount) * 100) : null,
      currency: input.currency || null,
      dueOn: input.dueDate || null,
    });
    return { routedTable: "obligations", routedId: created.id };
  }
  if (input.kind === "school_item") {
    if (!input.childMemberId) return { error: "Choose who this is for." };
    // Through HomeEvents' one door. Already on the calendar that day (a family
    // event or a school entry, by this or another name) is refused with its
    // name, never linked: undoing this item must never remove the original.
    const added = await addSchoolItem(
      supabase,
      {
        householdId,
        childMemberId: input.childMemberId,
        kind: input.schoolKind ?? "homework",
        title: input.title,
        subject: input.subject || null,
        detail: input.notes || null,
        ...schoolWhen({ date: input.dueDate, time: input.dueTime, endTime: input.endTime, timezone: membership.household.timezone }),
        estimatedMinutes: null,
      },
      { timeZone: membership.household.timezone },
    );
    if (added.kind === "duplicate") return { error: `“${added.existing.title}” is already on the calendar that day, so this was not added again.` };
    return { routedTable: "school_items", routedId: added.id };
  }
  if (input.kind === "health_document") {
    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    // No selection means "for me" — the extracted subjectMemberName is a
    // hint the confirm screen shows, never something trusted to pick an
    // identity on its own; RLS is what actually decides whether this
    // member (self, or a child the actor guards) is one they may file for.
    const subjectMemberId = input.subjectMemberId || membership.memberId;

    let filePath: string | null = null;
    const item = await getHomeSendItem(supabase, householdId, input.itemId);
    if (item?.filePath) {
      const { data: downloaded, error: downloadError } = await supabase.storage.from("home-send").download(item.filePath);
      if (downloadError) throw new Error(`home-send download failed: ${downloadError.message}`);
      const newPath = `${householdId}/${crypto.randomUUID()}`;
      const { error: uploadError } = await supabase.storage.from("health-records").upload(newPath, downloaded);
      if (uploadError) throw new Error(`health-records upload failed: ${uploadError.message}`);
      filePath = newPath;
    }

    const created = await createRecord(supabase, { householdId, memberId: membership.memberId }, {
      memberId: subjectMemberId,
      label: input.title,
      recordType: input.healthRecordType ?? "other",
      documentDate: input.documentDate || null,
      filePath,
      notes: input.notes || null,
      privacyScope: "private",
      sourceType: "home_send_document",
    });
    return { routedTable: "health_records", routedId: created.id };
  }
  return addGrocery(supabase, householdId, { title: input.title, quantity: input.quantity, unit: input.unit, category: input.category }, input.itemId);
}

/** One receipt line as a person's confirm keeps it (09-009, 25-003b). */
export type ReceiptLine = {
  name: string;
  quantity: number | "";
  unit: string;
  lineTotal: number | "";
  /** A tracked consumable's id, or "new" to start tracking it. */
  match: string;
  stock: boolean;
  clear: boolean;
};

/**
 * A receipt's lines recorded as purchases (09-009): each against the tracked
 * item it is, or a new tracked item, every write its own `homesend_changes`
 * row so each undoes on its own; what was bought added at home and taken off
 * the list only for the lines that say so (25-003b). Shared by a person's
 * confirm and by adding on its own, which keeps neither of those two.
 * Nothing is paid and nothing is ordered.
 */
export async function recordReceipt(
  supabase: Supabase,
  membership: Membership,
  input: { householdId: string; itemId: string; merchant?: string | null; purchasedOn: string; currency?: string | null },
  kept: readonly ReceiptLine[],
): Promise<{ firstPurchase: string; started: number; stocked: number; cleared: number } | { error: string }> {
  const tracked = await listConsumables(supabase, input.householdId);
  const groceries = new Map<string, GroceryItem>((await listGroceries(supabase, input.householdId)).map((item) => [item.id, item]));
  const byId = new Map(tracked.map((consumable) => [consumable.id, consumable]));
  const byName = new Map<string, { id: string }>(tracked.map((consumable) => [consumable.name.trim().toLowerCase(), { id: consumable.id }]));
  const currency = currencyCode(input.currency);
  const change = (domain: "grocery_item" | "purchase", entityId: string) =>
    recordHomeSendChange(supabase, { householdId: input.householdId, intakeId: input.itemId, domain, entityId, createdByMemberId: membership.memberId });

  let firstPurchase: string | null = null;
  let started = 0;
  let stocked = 0;
  let cleared = 0;
  for (const line of kept) {
    const quantity = line.quantity === "" ? 1 : line.quantity;
    let consumableId: string;
    if (line.match === "new") {
      // "New" never makes a second copy of something already tracked under
      // the same name — it records against that one instead.
      const same = byName.get(line.name.toLowerCase());
      if (same) {
        consumableId = same.id;
      } else {
        const created = await createConsumable(supabase, {
          householdId: input.householdId,
          name: line.name,
          category: CONSUMABLE_CATEGORIES[0],
          unit: line.unit || "unit",
          typicalQuantity: quantity,
        });
        consumableId = created.id;
        byName.set(line.name.toLowerCase(), { id: created.id });
        await change("grocery_item", created.id);
        started += 1;
      }
    } else {
      if (!byId.has(line.match)) return { error: `"${line.name}" was matched to something this household no longer tracks. Choose again.` };
      consumableId = line.match;
    }
    const purchase = await recordPurchase(supabase, {
      householdId: input.householdId,
      consumableId,
      purchasedOn: input.purchasedOn,
      quantity,
      unitCostMinor: unitCostMinor(line.lineTotal === "" ? null : line.lineTotal, quantity, currency),
      currency,
      merchant: input.merchant ?? null,
      unit: line.unit || null,
    });
    firstPurchase ??= purchase.id;
    await change("purchase", purchase.id);

    // At home and on the list, from what is on record now — a new item starts at what was bought.
    const plan = receiptStockLine({ quantity, unit: line.unit || null }, groceries.get(consumableId) ?? null, input.purchasedOn);
    if (line.stock && plan.bought && plan.addable) {
      await changeStock(supabase, {
        householdId: input.householdId,
        itemId: consumableId,
        kind: "add",
        amount: plan.bought,
        source: "receipt",
        idempotencyKey: `hsr:${purchase.id}`,
        sourceRef: { purchaseId: purchase.id, homeSendItemId: input.itemId },
      });
      stocked += 1;
    }
    if (line.clear && plan.bought && plan.clearable) {
      await adjustListEntry(supabase, { householdId: input.householdId, itemId: consumableId, kind: "subtract", amount: plan.bought, source: "receipt", idempotencyKey: `hsl:${purchase.id}` });
      cleared += 1;
    }
  }
  if (!firstPurchase) return { error: "Choose at least one line to record, or dismiss the receipt." };
  return { firstPurchase, started, stocked, cleared };
}
