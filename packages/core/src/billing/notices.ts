import type { SupabaseClient } from "@supabase/supabase-js";

import { formatterFor } from "../i18n/format";
import { DEFAULT_PREFERENCES } from "../i18n/preferences";
import { createNotification } from "../notifications/create";

/**
 * Telling the household what happened to its money (story 20-011).
 *
 * A notice comes only from the ledger: the payment or refund row the provider's
 * verified event just moved. It goes to one Admin — whoever started the
 * checkout while they are still an Admin, otherwise the head of the household
 * — and says what happened in plain words: never a card number, never the
 * provider's own message, and never "paid" before the provider said so.
 */

export type PaymentNotice =
  | { kind: "payment_succeeded"; paymentId: string; amount: number | null; currency: string | null; planKey: string | null }
  | { kind: "payment_failed"; paymentId: string; amount: number | null; currency: string | null; planKey: string | null }
  | { kind: "refund_succeeded"; refundId: string; paymentId: string; amount: number; currency: string };

/** Only a move into an outcome is news: a redelivered event, or a payment already there, says nothing new. */
export function paymentNoticeFor(
  was: string | null,
  now: string,
  payment: { id: string; amount: number | null; currency: string | null; planKey: string | null },
): PaymentNotice | null {
  if (was === now) return null;
  if (now === "succeeded") return { kind: "payment_succeeded", paymentId: payment.id, amount: payment.amount, currency: payment.currency, planKey: payment.planKey };
  if (now === "failed") return { kind: "payment_failed", paymentId: payment.id, amount: payment.amount, currency: payment.currency, planKey: payment.planKey };
  return null;
}

const ENGLISH = formatterFor(DEFAULT_PREFERENCES);

function planWords(planKey: string | null): string {
  return planKey ? `WonderHome ${planKey.charAt(0).toUpperCase()}${planKey.slice(1)}` : "your WonderHome plan";
}

/** The stored English for a notice. Amounts in their own currency, as major units. */
export function paymentNoticeText(notice: PaymentNotice): { title: string; body: string } {
  const money = (amount: number | null, currency: string | null) => (amount === null || !currency ? "" : ` of ${ENGLISH.money(amount, currency)}`);
  switch (notice.kind) {
    case "payment_succeeded":
      return { title: "Payment received", body: `Your payment${money(notice.amount, notice.currency)} for ${planWords(notice.planKey)} went through. The receipt is in Billing.` };
    case "payment_failed":
      return {
        title: "Payment didn't go through",
        body: `A payment${money(notice.amount, notice.currency)} for ${planWords(notice.planKey)} didn't go through. Nothing was taken, and your plan stays as it is while you try again from Billing.`,
      };
    case "refund_succeeded":
      return { title: "Refund completed", body: `A refund${money(notice.amount, notice.currency)} has been sent back to how you paid. It can take a few days to show.` };
  }
}

/** Who hears about a household's payments: the Admin who started the checkout, else the head. */
export async function paymentNoticeRecipient(admin: SupabaseClient, householdId: string, intentId: string | null): Promise<string | null> {
  if (intentId) {
    const { data: intent } = await admin.from("billing_intents").select("created_by_member_id").eq("id", intentId).eq("household_id", householdId).maybeSingle();
    const memberId = (intent as { created_by_member_id: string | null } | null)?.created_by_member_id ?? null;
    if (memberId) {
      const { data: role } = await admin
        .from("household_roles")
        .select("member_id, household_members!inner(status)")
        .eq("household_id", householdId)
        .eq("member_id", memberId)
        .in("role", ["head", "administrator"])
        .eq("household_members.status", "active")
        .limit(1);
      if ((role ?? []).length > 0) return memberId;
    }
  }
  const { data: household } = await admin.from("households").select("owner_member_id").eq("id", householdId).maybeSingle();
  return (household as { owner_member_id: string | null } | null)?.owner_member_id ?? null;
}

/** Sends each notice to the household's Admin. A notice that cannot be sent is dropped, never retried into a duplicate. */
export async function sendPaymentNotices(
  admin: SupabaseClient,
  input: { householdId: string; intentId: string | null; notices: readonly PaymentNotice[]; now?: Date },
): Promise<number> {
  if (input.notices.length === 0) return 0;
  const recipient = await paymentNoticeRecipient(admin, input.householdId, input.intentId);
  if (!recipient) return 0;
  const now = input.now ?? new Date();
  let sent = 0;
  for (const notice of input.notices) {
    const { title, body } = paymentNoticeText(notice);
    const failed = notice.kind === "payment_failed";
    const sourceId = notice.kind === "refund_succeeded" ? notice.refundId : notice.paymentId;
    const created = await createNotification(admin, {
      householdId: input.householdId,
      decision: {
        kind: "notify",
        recipientMemberId: recipient,
        type: failed ? "action" : "completion",
        // One thread per payment or refund: a later event about the same one updates it.
        threadKey: `billing:${notice.kind === "refund_succeeded" ? "refund" : "payment"}:${sourceId}`,
        updatesExistingThread: false,
        deliverAt: now,
        impact: body,
        action: { action: "open", target: "/settings/plan/billing" },
        factors: { riskLevel: failed ? "high" : "low", source: "billing_ledger", notice: notice.kind },
      },
      title,
      body,
      category: "bills",
      source: { type: notice.kind === "refund_succeeded" ? "payment_refund" : "payment", id: sourceId },
    });
    if (created) sent += 1;
  }
  return sent;
}
