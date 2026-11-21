import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { localMoment } from "../notifications/timing";
import { listAutopayRuns, settleAutopayRun } from "../finance/autopay";
import { cancelObligation, createObligation, listObligations, markObligationPaid, type PaidBill } from "../finance/repository";
import { confirmByEvidence, recordHomeSendChange } from "./changes";
import { matchPaymentToBill, paymentTitle, type OpenBill, type PaymentProof } from "./payment-proof";

/**
 * A payment proof written down (decision 2, the owner 2026-11-20). Run by
 * the deadlines pass with the service role, right after the item is read
 * (`home-send-auto.ts` asks for that household's pass at once) and on every
 * pass after, so nothing waits:
 *
 *   - it matches one open bill (payee, amount, date window): that bill is
 *     marked paid through the governed `markObligationPaid` a person's "Mark
 *     paid" uses, recorded as a HomeSend change with what it replaced (Undo
 *     puts the bill back), marked Checking, audited; and the bill's own
 *     Checking entry is confirmed (`confirmed_basis` "payment_proof"): its
 *     amount is what was paid;
 *   - it matches nothing, or matches a bill whose amount disagrees: it is
 *     recorded as a paid one-off entry on Bills ("Paid to …"), Checking, with
 *     Undo, and the bill it disagrees with is left as it is; the nightly check
 *     asks its "unusual amount" question about it (`verify-night.ts`).
 *
 * WonderHome never pays: this only records that the household did.
 */

type Row = Record<string, unknown>;

export type PaymentOutcome = "paid" | "recorded" | "conflict" | "settled";

const OPEN = ["expected", "received", "scheduled", "overdue"];

/** What the item keeps about its payment, so the nightly check can ask about a conflict. */
export type StoredPayment = PaymentProof & { outcome?: "paid" | "recorded" | "conflict"; billId?: string; billName?: string };

export function storedPayment(value: unknown): StoredPayment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.amount !== "number" || !(row.amount > 0) || typeof row.currency !== "string") return null;
  const method = row.method === "upi" || row.method === "card" || row.method === "bank" ? row.method : "bank";
  return {
    amount: row.amount,
    currency: row.currency,
    payee: typeof row.payee === "string" ? row.payee : null,
    paidOn: typeof row.paidOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.paidOn) ? row.paidOn : null,
    method,
    ...(row.outcome === "paid" || row.outcome === "recorded" || row.outcome === "conflict" ? { outcome: row.outcome } : {}),
    ...(typeof row.billId === "string" ? { billId: row.billId } : {}),
    ...(typeof row.billName === "string" ? { billName: row.billName } : {}),
  };
}

export async function settlePaymentProof(client: SupabaseClient, householdId: string, itemId: string, now: Date): Promise<PaymentOutcome> {
  const { data: itemRow, error } = await client
    .from("home_send_items")
    .select("id, status, updated_at, understanding, created_by_member_id")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "classified")
    .maybeSingle();
  if (error) throw new Error(`payment read failed: ${error.code ?? "unknown"}`);
  const row = itemRow as Row | null;
  if (!row) return "settled";
  const understanding = (row.understanding as Record<string, unknown> | null) ?? {};
  const proof = storedPayment(understanding.payment);
  // Content that tried to instruct WonderHome is never taken as proof of anything.
  const safety = understanding.safety as { instructionsIgnored?: boolean } | undefined;
  if (!proof || safety?.instructionsIgnored === true) return "settled";

  // The bills on record through Bills' own read (HomeSend never reads or writes a household table itself, X-003).
  const [{ data: household }, onRecord] = await Promise.all([
    client.from("households").select("timezone, owner_member_id").eq("id", householdId).maybeSingle(),
    listObligations(client, householdId),
  ]);
  const today = localMoment(now, ((household?.timezone as string | null) || "UTC") as string).dateKey;
  const actor = (row.created_by_member_id as string | null) ?? ((household?.owner_member_id as string | null) ?? null);
  if (!actor) return "settled";
  const bills: OpenBill[] = onRecord
    .filter((bill) => OPEN.includes(bill.status))
    .slice(0, 300)
    .map((bill) => ({ id: bill.id, name: bill.name ?? "", payee: bill.payee, amountMinor: bill.amountMinor, currency: bill.currency, dueOn: bill.dueOn, status: bill.status }));
  const paidOn = proof.paidOn ?? today;
  const amountMinor = Math.round(proof.amount * 100);

  // A bill already marked paid by autopay and still Checking (11-024): a payment that agrees confirms it;
  // one that disagrees flags it and is recorded on its own below, so the nightly check asks its
  // "unusual amount" question. The autopay payment itself is never changed.
  const runs = (await listAutopayRuns(client, householdId, now)).filter((run) => run.state === "checking");
  const byId = new Map(onRecord.map((bill) => [bill.id, bill]));
  const runBills: OpenBill[] = runs.flatMap((run) => {
    const bill = byId.get(run.obligationId);
    return bill ? [{ id: run.id, name: bill.name ?? "", payee: bill.payee, amountMinor: run.amountMinor, currency: run.currency, dueOn: run.dueOn, status: "expected" }] : [];
  });
  const autopayMatch = runBills.length > 0 ? matchPaymentToBill(proof, runBills, today) : ({ type: "none" } as const);
  const autopayRun = autopayMatch.type === "none" ? null : runs.find((run) => run.id === autopayMatch.billId)!;
  const match = autopayRun ? ({ type: "none" } as const) : matchPaymentToBill(proof, bills, today);

  // Claimed by its review columns first, so a person who settled it meanwhile wins.
  const { data: claimed, error: claimError } = await client
    .from("home_send_items")
    .update({ review_decision: match.type === "paid" || autopayMatch.type === "paid" ? "updated" : "auto_added", review_subject: "not_needed", review_corrected: false, reviewed_at: now.toISOString() })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "classified")
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if (claimError) throw new Error(`payment claim failed: ${claimError.code ?? "unknown"}`);
  if ((claimed ?? []).length === 0) return "settled";
  const release = () => client.from("home_send_items").update({ review_decision: null, review_subject: null, review_corrected: null, reviewed_at: null }).eq("household_id", householdId).eq("id", itemId).eq("status", "classified");

  if (autopayRun && autopayMatch.type === "paid") {
    const bill = byId.get(autopayRun.obligationId)!;
    await route(client, householdId, itemId, autopayRun.obligationId, now, { ...understanding, payment: { ...proof, outcome: "paid", billId: autopayRun.obligationId, billName: bill.name ?? "" } });
    await settleAutopayRun(client, householdId, autopayRun.id, true, now);
    await auditChange({ householdId, eventType: "homesend.payment_recorded", targetTable: "obligations", targetId: autopayRun.obligationId, metadata: { intakeId: itemId, outcome: "autopay_confirmed", method: proof.method } });
    return "paid";
  }

  if (match.type === "paid") {
    let paid: PaidBill;
    try {
      paid = await markObligationPaid(client, { householdId, obligationId: match.billId, paidOn, amountMinor, currency: proof.currency });
    } catch (thrown) {
      await release();
      throw thrown;
    }
    const bill = bills.find((entry) => entry.id === match.billId)!;
    await route(client, householdId, itemId, match.billId, now, { ...understanding, payment: { ...proof, outcome: "paid", billId: match.billId, billName: bill.name } });
    await recordHomeSendChange(client, {
      householdId,
      intakeId: itemId,
      domain: "bill",
      entityId: match.billId,
      createdByMemberId: actor,
      changeType: "updated",
      // Undo takes the payment back (`undoBillPayment`), the bill as it was before.
      previous: { payment: paid },
      auto: { state: "unconfirmed", confidence: null, source: "payment_proof" },
    });
    // The bill's own Checking entry is confirmed by the payment: its amount is what was paid.
    await confirmByEvidence(client, householdId, match.billId, "payment_proof", { intakeId: itemId, now });
    await auditChange({ householdId, eventType: "homesend.payment_recorded", targetTable: "obligations", targetId: match.billId, metadata: { intakeId: itemId, outcome: "paid", method: proof.method, amountConfirmed: match.amountConfirmed } });
    return "paid";
  }

  // Nothing it paid on record, or a bill whose amount disagrees: recorded on its own as a paid one-off.
  let created: { id: string };
  try {
    created = await createObligation(client, {
      householdId,
      name: paymentTitle(proof),
      kind: "other",
      billType: null,
      recurrence: "one_off",
      payee: proof.payee?.slice(0, 120) ?? null,
      amountMinor,
      currency: proof.currency,
      dueOn: paidOn,
    });
  } catch (thrown) {
    await release();
    throw thrown;
  }
  try {
    await markObligationPaid(client, { householdId, obligationId: created.id, paidOn, amountMinor, currency: proof.currency });
  } catch (thrown) {
    await cancelObligation(client, { id: created.id, householdId }).catch(() => undefined);
    await release();
    throw thrown;
  }
  const autopayBill = autopayRun ? byId.get(autopayRun.obligationId) : undefined;
  const conflict = autopayRun && autopayBill
    ? { id: autopayBill.id, name: autopayBill.name ?? "" }
    : match.type === "amount_conflict" ? bills.find((entry) => entry.id === match.billId) : undefined;
  if (autopayRun) await settleAutopayRun(client, householdId, autopayRun.id, false, now);
  await route(client, householdId, itemId, created.id, now, { ...understanding, payment: { ...proof, outcome: conflict ? "conflict" : "recorded", ...(conflict ? { billId: conflict.id, billName: conflict.name } : {}) } });
  await recordHomeSendChange(client, { householdId, intakeId: itemId, domain: "bill", entityId: created.id, createdByMemberId: actor, auto: { state: "unconfirmed", confidence: null, source: "payment_proof" } });
  await auditChange({ householdId, eventType: "homesend.payment_recorded", targetTable: "obligations", targetId: created.id, metadata: { intakeId: itemId, outcome: conflict ? "conflict" : "recorded", method: proof.method } });
  return conflict ? "conflict" : "recorded";
}

async function route(client: SupabaseClient, householdId: string, itemId: string, billId: string, now: Date, understanding: Record<string, unknown>): Promise<void> {
  const { error } = await client
    .from("home_send_items")
    .update({ status: "routed", routed_table: "obligations", routed_id: billId, routed_at: now.toISOString(), understanding })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "classified");
  if (error) throw new Error(`payment route failed: ${error.code ?? "unknown"}`);
}
