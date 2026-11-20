import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { CONSUMABLE_CATEGORIES } from "../commerce/consumables";
import { createConsumable, listConsumables, recordPurchase } from "../commerce/repository";
import { currencyCode, unitCostMinor } from "../commerce/receipts";
import { createObligation } from "../finance/repository";
import { createRecord, RECORD_TYPES, type RecordType } from "../health/records";
import { recordHomeSendChange } from "./changes";
import type { DocumentRecord } from "./document";
import type { HomeSendChangeDomain, HomeSendExtraction } from "./items";
import { billShape } from "./record-types";
import type { HouseholdContextItem } from "../context/types";
import { usualBill } from "../homebrain/history-fill";
import { listPayeeBills } from "../homebrain/household-records";
import { keepFilledWhy, readSenderHistory } from "./sender-history";
import { healthSubjectFor } from "./health-filers";
import { loadHealthMembers } from "../household/direct-add-repository";
import { vendorKey } from "../homebrain/rules";

/**
 * "Add this bill?" applied (the owner, 2026-11-20: "record"). A waiting bill,
 * receipt or health document that record first could not add on its own
 * (money and health set to "Wait for review", a missing amount or due date, a
 * document with several records) gets one Needs-you question, Add or Set
 * aside (`deadlines.ts` `addQuestion`). Add, by a person's tap or by the
 * 24-hour default, records it with what is known, marked Checking ("not yet
 * confirmed", money "check before paying"), with Undo:
 *
 *   - a bill through `createObligation`; a payee not given comes from this
 *     sender's earlier bills, and an amount or due date not given takes the
 *     payee's usual (decision 3, 2026-11-20: the median of its bills on
 *     record, two or more, `homebrain/history-fill.ts`), with "Why?" kept on
 *     the item; with no history it stays blank (the Bills screen says "amount
 *     not in yet" / "no due date"), and a bill with no due date has no reminder
 *     until one is set (`notifications/sources.ts`); a document with several
 *     bills records each;
 *   - a receipt's lines as purchases, against the tracked item of that name or
 *     a newly tracked one, dated by the receipt or else the day it was sent;
 *   - a health document filed privately for the person who sent it, only
 *     when its own words name the sender or the sender tapped "It's mine" on
 *     "Who is this for?" (never by a default: 2026-11-20), with its file
 *     copied to health records; or, from a sender on "Who may file health
 *     records for others", for the member it names (`health-filers.ts`).
 *
 * Since 2026-11-20 ("as autonomous as possible") the question is asked only
 * when an Admin set money or health to "Wait for review"; otherwise the
 * deadlines step adds it at once (`byRule`), as the default would have a day
 * later. Every entry is an `unconfirmed` HomeSend change, so it shows Checking
 * and is in the daily summary with Undo. Nothing is ever paid. The item is claimed
 * through its review columns first (a routed item needs its table and id
 * together), so a person who settled it meanwhile wins.
 */

type Row = Record<string, unknown>;

export type AddResult = "done" | "settled";

/** Whether an item can be added this way at all; the deadlines step asks only about these. */
export function canAdd(input: { kind: string | null; senderMemberId: string | null; extracted: Partial<HomeSendExtraction> | null; records: readonly unknown[] | null }): boolean {
  const title = input.extracted?.title?.trim();
  if (input.kind === "bill") return Boolean(title) || billRecords(input.records).length > 0;
  if (input.kind === "receipt") return receiptLines(input.extracted).length > 0;
  // A health record is filed for the person who sent it; with nobody (an email), there is no one to file it for.
  if (input.kind === "health_document") return Boolean(title) && Boolean(input.senderMemberId);
  return false;
}

function billRecords(records: readonly unknown[] | null): DocumentRecord[] {
  return ((records ?? []) as DocumentRecord[]).filter((record) => record && record.domain === "bill" && typeof record.title === "string" && record.title.trim().length > 0);
}

function receiptLines(read: Partial<HomeSendExtraction> | null) {
  return (read?.lines ?? []).filter((line) => typeof line?.name === "string" && line.name.trim().length > 0).slice(0, 40);
}

export async function addWaitingItem(
  client: SupabaseClient,
  householdId: string,
  itemId: string,
  how: {
    byDefault: boolean;
    memberId: string | null;
    now: Date;
    /**
     * A health document from a sender on "Who may file health records for
     * others" that names another member (`health-filers.ts`): filed for that
     * member instead of the sender. The caller checked the list.
     */
    healthFor?: string | null;
    /**
     * A health document its sender said is theirs ("Who is this for?" → "It's
     * mine"): a person's own tap, by the sender, never a default.
     */
    forSender?: boolean;
    /** Added by the deadlines step's own rule, not a question's default (2026-11-20: "Add this bill?" only under "Wait for review"). */
    byRule?: boolean;
  },
): Promise<AddResult> {
  const { data: itemRow, error } = await client
    .from("home_send_items")
    .select("id, status, updated_at, classified_kind, extracted, file_path, created_by_member_id, created_at, sender_address, records:understanding->document->records")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .in("status", ["received", "classified"])
    .maybeSingle();
  if (error) throw new Error(`add read failed: ${error.code ?? "unknown"}`);
  const row = itemRow as Row | null;
  if (!row) return "settled";
  const kind = row.classified_kind as string | null;
  const read = (row.extracted as Partial<HomeSendExtraction> | null) ?? null;
  const records = Array.isArray(row.records) ? (row.records as unknown[]) : null;
  const sender = (row.created_by_member_id as string | null) ?? null;
  if (!canAdd({ kind, senderMemberId: sender, extracted: read, records })) return "settled";
  const { data: household } = await client.from("households").select("owner_member_id").eq("id", householdId).maybeSingle();
  // Whose name the change rows carry: the person who tapped, else the sender, else the owner (always an Admin); the audit says "default".
  const actor = how.memberId ?? sender ?? ((household?.owner_member_id as string | null) ?? null);
  if (!actor) return "settled";
  // Who a health document is for is never filled by a rule or a default (2026-11-20): filed for its sender only when
  // its own words say it is theirs, or the sender said so with their own tap; else it waits for "Who is this for?".
  if (kind === "health_document" && !how.healthFor && !(how.forSender === true && !how.byDefault && how.memberId === sender)) {
    if ((await healthSubjectOf(client, householdId, sender, read)) !== "sender") return "settled";
  }

  const claimed = await claim(client, householdId, row, how.now);
  if (!claimed) return "settled";

  const written: { domain: HomeSendChangeDomain; entityId: string; table: string }[] = [];
  try {
    if (kind === "bill") {
      const several = billRecords(records);
      let bills = several.length > 1 ? several.map((record) => ({ title: record.title, payee: record.payee, amount: record.amount, currency: record.currency, dueOn: record.date })) : [{ title: read?.title ?? several[0]?.title ?? "", payee: read?.payee ?? null, amount: read?.amount ?? null, currency: read?.currency ?? null, dueOn: read?.dueDate ?? null }];
      // One bill with blanks: the household's own history fills what it can (decision 3), always Checking.
      if (bills.length === 1) {
        const filled = await fillBlanks(client, householdId, itemId, bills[0]!, { sender: (row.sender_address as string | null) ?? null, receivedAt: (row.created_at as string) ?? how.now.toISOString() });
        bills = [filled.bill];
        if (filled.why.length > 0) await keepFilledWhy(client, householdId, itemId, { why: filled.why, fields: filled.fields });
      }
      for (const bill of bills.slice(0, 20)) {
        const title = bill.title.trim().slice(0, 160);
        if (!title) continue;
        const shape = billShape({ title, payee: bill.payee ?? null, kind: null });
        const amount = typeof bill.amount === "number" && bill.amount > 0 ? bill.amount : null;
        const currency = amount !== null ? currencyCode(bill.currency) : null;
        const created = await createObligation(client, {
          householdId,
          name: title,
          kind: shape.kind,
          billType: shape.billType,
          recurrence: shape.recurrence,
          payee: bill.payee?.trim().slice(0, 120) || null,
          // An amount needs its currency (obligations_amount_has_currency): without one it stays "not in yet".
          amountMinor: amount !== null && currency ? Math.round(amount * 100) : null,
          currency: amount !== null && currency ? currency : null,
          dueOn: bill.dueOn?.slice(0, 10) || null,
        });
        written.push({ domain: "bill", entityId: created.id, table: "obligations" });
      }
    } else if (kind === "receipt") {
      const currency = currencyCode(read?.currency);
      const purchasedOn = read?.documentDate?.slice(0, 10) || (row.created_at as string).slice(0, 10);
      const tracked = new Map((await listConsumables(client, householdId)).map((item) => [item.name.trim().toLowerCase(), item.id]));
      for (const line of receiptLines(read)) {
        const name = line.name.trim().slice(0, 120);
        const quantity = typeof line.quantity === "number" && line.quantity > 0 ? line.quantity : 1;
        let consumableId = tracked.get(name.toLowerCase());
        if (!consumableId) {
          consumableId = (await createConsumable(client, { householdId, name, category: CONSUMABLE_CATEGORIES[0], unit: line.unit?.slice(0, 20) || "unit", typicalQuantity: quantity })).id;
          tracked.set(name.toLowerCase(), consumableId);
          written.push({ domain: "grocery_item", entityId: consumableId, table: "consumables" });
        }
        const purchase = await recordPurchase(client, {
          householdId,
          consumableId,
          purchasedOn,
          quantity,
          unitCostMinor: unitCostMinor(typeof line.lineTotal === "number" ? line.lineTotal : null, quantity, currency),
          currency,
          merchant: read?.merchant?.trim().slice(0, 120) || null,
          unit: line.unit?.slice(0, 20) || null,
        });
        written.push({ domain: "purchase", entityId: purchase.id, table: "consumable_purchases" });
      }
    } else if (kind === "health_document") {
      let filePath: string | null = null;
      const source = row.file_path as string | null;
      if (source) {
        const { data: downloaded, error: downloadError } = await client.storage.from("home-send").download(source);
        if (downloadError) throw new Error("home-send download failed");
        const target = `${householdId}/${crypto.randomUUID()}`;
        const { error: uploadError } = await client.storage.from("health-records").upload(target, downloaded);
        if (uploadError) throw new Error("health-records upload failed");
        filePath = target;
      }
      const recordType = (RECORD_TYPES as readonly string[]).includes(read?.healthRecordType ?? "") ? (read!.healthRecordType as RecordType) : "other";
      const created = await createRecord(client, { householdId, memberId: actor }, {
        // Filed for the person who sent it, privately: the same as a person's own Add with nobody else picked;
        // for the member it names when its sender may file health records for others (the owner, 2026-11-20).
        memberId: how.healthFor ?? sender!,
        label: (read?.title ?? "").trim().slice(0, 160),
        recordType,
        documentDate: read?.documentDate?.slice(0, 10) || null,
        filePath,
        notes: null,
        privacyScope: "private",
        sourceType: "home_send_document",
      });
      written.push({ domain: "health_document", entityId: created.id, table: "health_records" });
    }
  } catch (thrown) {
    // Nothing written: the claim is let go and it waits. Something written: it is kept, recorded and Checking like the rest.
    if (written.length === 0) {
      await release(client, householdId, itemId);
      throw thrown;
    }
  }
  const first = written.find((entry) => entry.domain !== "grocery_item") ?? written[0];
  if (!first) {
    await release(client, householdId, itemId);
    return "settled";
  }

  const { error: routeError } = await client
    .from("home_send_items")
    .update({ status: "routed", routed_table: first.table, routed_id: first.entityId, routed_at: how.now.toISOString() })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .in("status", ["received", "classified"]);
  if (routeError) throw new Error(`add route failed: ${routeError.code ?? "unknown"}`);
  const filedForOther = kind === "health_document" && Boolean(how.healthFor) && how.healthFor !== sender;
  for (const entry of written) {
    await recordHomeSendChange(client, {
      householdId,
      intakeId: itemId,
      domain: entry.domain,
      entityId: entry.entityId,
      createdByMemberId: actor,
      auto: { state: "unconfirmed", confidence: null, source: filedForOther ? "health_filer" : how.byRule ? "record_first" : how.byDefault ? "needs_you_default" : "needs_you" },
    });
  }
  await auditChange({
    householdId,
    actorMemberId: how.byDefault ? undefined : (how.memberId ?? undefined),
    eventType: filedForOther ? "homesend.health_filed_for" : "homesend.added_checking",
    targetTable: first.table,
    targetId: first.entityId,
    metadata: { intakeId: itemId, kind, entries: written.length, by: how.byRule ? "rule" : how.byDefault ? "default" : "person", ...(filedForOther ? { filedFor: how.healthFor, sender, by: "allowed_filer" } : {}) },
  });
  return "done";
}

/** Whose a health document is, from its own words and the household's members; unreadable members: "unclear". */
async function healthSubjectOf(client: SupabaseClient, householdId: string, sender: string | null, read: Partial<HomeSendExtraction> | null) {
  const members = await loadHealthMembers(client, householdId);
  if (!members) return "unclear" as const;
  return healthSubjectFor({ senderMemberId: sender, names: [read?.subjectMemberName, ...(read?.people ?? [])], members });
}

/** Claimed by its review columns alone: it stays where it waits until what it becomes exists. */
async function claim(client: SupabaseClient, householdId: string, row: Row, now: Date): Promise<boolean> {
  const { data, error } = await client
    .from("home_send_items")
    .update({ review_decision: "added", review_subject: "not_needed", review_corrected: false, reviewed_at: now.toISOString() })
    .eq("household_id", householdId)
    .eq("id", row.id as string)
    .eq("status", row.status as string)
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if (error) throw new Error(`add claim failed: ${error.code ?? "unknown"}`);
  return (data ?? []).length > 0;
}

async function release(client: SupabaseClient, householdId: string, itemId: string): Promise<void> {
  await client.from("home_send_items").update({ review_decision: null, review_subject: null, review_corrected: null, reviewed_at: null }).eq("household_id", householdId).eq("id", itemId).in("status", ["received", "classified"]);
}

type BlankBill = { title: string; payee: string | null; amount: number | null; currency: string | null; dueOn: string | null };

/**
 * A waiting bill's blanks from the household's own history (decision 3,
 * 2026-11-20): its payee from this sender's earlier bills, then that payee's
 * usual amount and day from its bills on record. Read with the same client
 * that writes it; anything unreadable leaves the blank as it was.
 */
async function fillBlanks(client: SupabaseClient, householdId: string, itemId: string, bill: BlankBill, from: { sender: string | null; receivedAt: string }): Promise<{ bill: BlankBill; why: string[]; fields: string[] }> {
  const why: string[] = [];
  const fields: string[] = [];
  let next = { ...bill };
  if (!next.payee?.trim() && from.sender) {
    const history = await readSenderHistory(client, householdId, from.sender, { exceptItemId: itemId });
    const keys = new Set(history.payees.map((entry) => vendorKey(entry.name)));
    if (history.payees.length > 0 && keys.size === 1 && !keys.has(null)) {
      next = { ...next, payee: history.payees[0]!.name };
      why.push(`${history.payees.length === 1 ? "The last bill" : `All ${history.payees.length} earlier bills`} from ${from.sender} ${history.payees.length === 1 ? "was" : "were"} from ${history.payees[0]!.name}.`);
      fields.push("payee");
    }
  }
  const missingAmount = typeof next.amount !== "number" || next.amount <= 0;
  const missingDay = !next.dueOn;
  if (!next.payee?.trim() || (!missingAmount && !missingDay)) return { bill: next, why, fields };
  try {
    const onRecord = await listPayeeBills(client, householdId);
    const items = onRecord.map((row) => ({ entityType: "bill", entityId: row.id, attributes: { payee: row.payee, amountMinor: row.amountMinor, currency: row.currency, dueOn: row.dueOn, status: row.status } }) as unknown as HouseholdContextItem);
    const usual = usualBill(next.payee, items, from.receivedAt);
    if (usual?.amount && missingAmount) {
      next = { ...next, amount: usual.amount.value, currency: usual.amount.currency };
      why.push(`The amount is ${usual.payee}'s usual, from its last ${usual.amount.count} bills on record — check it before paying.`);
      fields.push("amount");
    }
    if (usual?.dueOn && missingDay) {
      next = { ...next, dueOn: usual.dueOn.value };
      why.push(`The due day is ${usual.payee}'s usual, from its last ${usual.dueOn.count} bills on record.`);
      fields.push("date");
    }
  } catch {
    // No history readable: blanks stay blank.
  }
  return { bill: next, why, fields };
}
