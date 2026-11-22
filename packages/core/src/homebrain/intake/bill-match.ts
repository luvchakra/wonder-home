import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRequired } from "./completeness";
import type { HomeSendExtraction, HomeSendKind } from "../../homesend/items";
import { reconcileHomeSend, type HomeSendCandidate, type HomeSendReconciliation, type ReconcilableDomain } from "./reconcile";

/** What the item matches on record now, or null (not one of these kinds, not readable, or nothing on record). */
export async function matchOnRecord(
  client: SupabaseClient,
  householdId: string,
  item: { kind: HomeSendKind | null; extracted: Partial<HomeSendExtraction> | null; change: string | null; createdAt: string },
  options: { timezone: string; now: Date },
): Promise<HomeSendReconciliation | null> {
  const domain = candidateDomain(item.kind);
  const title = item.extracted?.title?.trim();
  if (!domain || !title) return null;
  const candidate: HomeSendCandidate = {
    kind: domain,
    title,
    date: item.extracted?.dueDate ?? item.extracted?.documentDate ?? null,
    amount: typeof item.extracted?.amount === "number" ? item.extracted.amount : null,
    payee: item.extracted?.payee ?? null,
    subjectMemberId: null,
    capturedAt: item.createdAt,
    change: item.change === "update" || item.change === "cancellation" ? item.change : "new",
  };
  return reconcileHomeSend(client, householdId, candidate, { timezone: options.timezone, now: options.now, strict: true });
}

/** Bills reconcile as bills, health documents as health records; a receipt has nothing to reconcile with (09-009). */
function candidateDomain(kind: HomeSendKind | null): ReconcilableDomain | null {
  if (kind === "bill") return "bill";
  if (kind === "health_document") return "health_document";
  return null;
}

/** A bill record first would have added on its own: one record, nothing it can't be added without. */
export function canRecordBill(read: Partial<HomeSendExtraction> | null, records: readonly unknown[] | null): boolean {
  if (records && records.length > 1) return false;
  const title = read?.title?.trim();
  if (!title) return false;
  const amount = typeof read?.amount === "number" && read.amount > 0 ? read.amount : null;
  return missingRequired("bill", { title, dueDate: read?.dueDate ?? null, payee: read?.payee ?? null, amount }).length === 0;
}
