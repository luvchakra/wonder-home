"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { homesendCorrectionEvidence, recordCorrectionEvidence } from "@wonderhome/core/evaluation/evidence";
import { listObligations } from "@wonderhome/core/finance/repository";
import { applyDocumentPlan, type IntakeChangeReceipt, type PlanWriter } from "@wonderhome/core/homesend/apply";
import { recordHomeSendChange } from "@wonderhome/core/homesend/changes";
import type { DocumentRecord } from "@wonderhome/core/homesend/document";
import type { PlanEntry } from "@wonderhome/core/homesend/plan";
import { getHomeSendItem, recordDocumentApplied } from "@wonderhome/core/homesend/repository";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { listSchoolItems } from "@wonderhome/core/school/repository";
import { createClient } from "@wonderhome/core/db/server";

import { planFor } from "./home-send-review";
import { createNew, reviseExisting, type Membership, type RouteInput, type Supabase } from "./home-send-writes";

/**
 * Applying a document's change plan (Deep Document Understanding 2.0 §22–27,
 * §38, §42–44).
 *
 * The browser sends only choices: which records to include, who a record is
 * for when WonderHome asked, and a person's own corrections to a record's
 * name, day or amount. The plan itself is rebuilt here, on the member's own
 * client, from the stored reading and what is on record right now — so a
 * record that changed since the review is reconciled again, never
 * overwritten by a stale plan. Every write goes through its domain's own
 * service, is checked, and is recorded with its field-level before and after
 * so it can be undone exactly.
 */

export type ApplyPlanState = { error?: string; notice?: string; receipt?: IntakeChangeReceipt };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const editSchema = z.object({
  title: z.string().trim().min(1, { error: "Every record needs a name." }).max(160).optional(),
  date: z.union([z.string().regex(DAY), z.literal("")]).optional(),
  amount: z.union([z.coerce.number().min(0).max(10_000_000), z.literal("")]).optional(),
});

const applySchema = z.object({
  householdId: z.uuid(),
  itemId: z.uuid(),
  include: z.array(z.string().regex(/^r\d{1,3}$/)).max(12),
  answers: z.record(z.string().regex(/^r\d{1,3}$/), z.uuid()),
  edits: z.record(z.string().regex(/^r\d{1,3}$/), editSchema),
});

function readForm(formData: FormData) {
  const answers: Record<string, string> = {};
  const edits: Record<string, Record<string, string>> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const answer = /^answer\.(r\d{1,3})$/.exec(name);
    if (answer && value) answers[answer[1]!] = value;
    const edit = /^edit\.(r\d{1,3})\.(title|date|amount)$/.exec(name);
    if (edit) (edits[edit[1]!] ??= {})[edit[2]!] = value;
  }
  return {
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    include: formData.getAll("include").filter((value): value is string => typeof value === "string"),
    answers,
    edits,
  };
}

/** A person's correction wins over what was read — kept as the record the plan is rebuilt from. */
function withEdits(records: DocumentRecord[], edits: Record<string, z.infer<typeof editSchema>>): DocumentRecord[] {
  return records.map((record) => {
    const edit = edits[record.key];
    if (!edit) return record;
    return {
      ...record,
      title: edit.title ?? record.title,
      date: edit.date === undefined ? record.date : edit.date || null,
      amount: record.domain === "bill" && edit.amount !== undefined ? (edit.amount === "" ? null : Number(edit.amount)) : record.amount,
    };
  });
}

/** What the one-item write path needs, from a plan entry the server itself built. */
function routeInputFor(entry: PlanEntry, householdId: string, itemId: string): RouteInput {
  const record = entry.record;
  return {
    householdId,
    itemId,
    decision: entry.action === "update" ? "update" : entry.action === "cancel" ? "cancel" : "add",
    existingId: entry.existing?.id,
    kind: entry.domain,
    title: entry.title.slice(0, 160),
    notes: [record.notes, record.location ? `Where: ${record.location}` : null].filter(Boolean).join(" · ") || undefined,
    billKind: (record.billKind as RouteInput["billKind"]) ?? undefined,
    payee: record.payee ?? undefined,
    amount: record.amount ?? undefined,
    currency: record.currency ?? undefined,
    dueDate: record.date ?? undefined,
    dueTime: record.time ?? undefined,
    endTime: record.endTime ?? undefined,
    childMemberId: entry.person?.memberId,
    schoolKind: SCHOOL_ITEM_KINDS.find((kind) => kind === record.schoolKind) ?? "event",
    subject: record.subject ?? undefined,
    quantity: record.quantity ?? undefined,
    unit: record.unit ?? undefined,
    needs: [],
  };
}

/**
 * Did the update actually land? (§51 E2: verify database outcome.) Read the
 * record back through the same client and compare what the plan changed.
 */
async function verifyUpdate(supabase: Supabase, householdId: string, entry: PlanEntry, timezone: string): Promise<void> {
  const record = entry.record;
  if (entry.domain === "bill") {
    const bill = (await listObligations(supabase, householdId)).find((row) => row.id === entry.existing?.id);
    if (!bill) throw new Error("not found after update");
    if (record.date && bill.dueOn !== record.date) throw new Error("due date did not change");
    if (record.amount !== null && bill.amountMinor !== Math.round(record.amount * 100)) throw new Error("amount did not change");
    return;
  }
  if (entry.domain === "school_item" && record.date) {
    const item = (await listSchoolItems(supabase, householdId)).find((row) => row.id === entry.existing?.id);
    const day = item?.dueAt ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(item.dueAt) : null;
    if (day !== record.date) throw new Error("date did not change");
  }
}

function writerFor(supabase: Supabase, membership: Membership, itemId: string): PlanWriter {
  const householdId = membership.household.id;
  return {
    async create(entry) {
      const created = await createNew(supabase, membership, routeInputFor(entry, householdId, itemId));
      if ("error" in created) throw new Error(created.error);
      return { entityId: created.routedId };
    },
    async update(entry) {
      if (!entry.existing) throw new Error("nothing to update");
      const revised = await reviseExisting(supabase, membership, { ...routeInputFor(entry, householdId, itemId), existingId: entry.existing.id, decision: "update" });
      await verifyUpdate(supabase, householdId, entry, membership.household.timezone);
      return { entityId: revised.routedId, previous: revised.previous };
    },
    async cancel(entry) {
      if (!entry.existing) throw new Error("nothing to cancel");
      const revised = await reviseExisting(supabase, membership, { ...routeInputFor(entry, householdId, itemId), existingId: entry.existing.id, decision: "cancel" });
      return { entityId: revised.routedId, previous: revised.previous };
    },
    async record(entry, result, changeType) {
      const change = await recordHomeSendChange(supabase, {
        householdId,
        intakeId: itemId,
        domain: entry.domain,
        entityId: result.entityId,
        createdByMemberId: membership.memberId,
        changeType,
        previous: result.previous ?? null,
        planKey: entry.key,
        fields: entry.changes,
        evidence: entry.evidence,
      });
      return change.id;
    },
  };
}

const ROUTED_TABLE: Record<PlanEntry["domain"], string> = { bill: "obligations", school_item: "school_items", grocery_item: "consumables" };

export async function applyDocumentPlanAction(_previous: ApplyPlanState, formData: FormData): Promise<ApplyPlanState> {
  const parsed = applySchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  const input = parsed.data;

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, input.householdId);
    const item = await getHomeSendItem(supabase, input.householdId, input.itemId);
    if (!item) return { error: "That is not part of this household." };
    // Applying twice never writes twice (§42): what was done is shown again.
    if (item.receipt && item.status !== "received" && item.status !== "classified") return { receipt: item.receipt, notice: "Already applied — here is what it did." };
    if (item.status !== "received" && item.status !== "classified") return { error: "This has already been handled." };

    const plan = await planFor(supabase, membership, item, { answers: input.answers, edit: (records) => withEdits(records, input.edits) });
    if (!plan) return { error: "There is nothing in this document to apply." };

    const receipt = await applyDocumentPlan(plan, new Set(input.include), writerFor(supabase, membership, item.id), { intakeId: item.id });
    const first = receipt.changes.find((change) => change.changeId && change.entityId);
    const counts = receipt.counts;
    await recordDocumentApplied(supabase, input.householdId, item.id, {
      plan,
      receipt,
      routed: first ? { table: ROUTED_TABLE[first.domain], id: first.entityId! } : null,
      // Closed words only (§19): what kind of outcome this was, never its content.
      review: first
        ? { decision: counts.created > 0 ? "added" : counts.updated > 0 ? "updated" : "cancelled", proposal: counts.updated > 0 ? "update" : null, subject: plan.entries.some((entry) => entry.question) ? "asked" : "resolved", corrected: Object.keys(input.edits).length > 0 }
        : receipt.status === "no_change"
          ? { decision: "kept_existing", proposal: "duplicate", subject: null, corrected: null }
          : null,
    });

    // A person's correction to what was read is evaluation evidence (Wave 5
    // §13) — append-only, best-effort, never at the cost of the apply.
    const read = item.understanding?.document?.records ?? [];
    for (const [key, edit] of Object.entries(input.edits)) {
      const before = read.find((record) => record.key === key);
      if (!before) continue;
      const evidence = homesendCorrectionEvidence(
        { kind: before.domain, title: before.title, date: before.date, amount: before.amount, quantity: before.quantity },
        { kind: before.domain, title: edit.title ?? before.title, date: edit.date === undefined ? before.date : edit.date || null, amount: edit.amount === undefined ? before.amount : edit.amount === "" ? null : Number(edit.amount), quantity: before.quantity },
      );
      if (evidence.length === 0) continue;
      await recordCorrectionEvidence(createAdminClient(), { householdId: input.householdId, surface: "homesend", sourceType: "home_send_item", sourceId: item.id, memberId: membership.memberId, evidence }).catch((error) =>
        log.warn("correction evidence not recorded", { reason: error instanceof Error ? error.message : "unknown" }),
      );
    }

    for (const path of ["/ai", "/home-send", "/bills", "/school", "/groceries"]) revalidatePath(path);
    return { receipt };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}
