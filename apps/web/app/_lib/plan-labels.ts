import { formatPrice, paymentStatusWords, type PriceLine } from "@wonderhome/core/billing/account";
import type { PaymentProviderName, PaymentStatus } from "@wonderhome/core/billing/provider";
import type { Translate } from "@wonderhome/core/i18n/translate";

import type { CancelPlanLabels } from "../_components/cancel-plan-button";
import type { CheckoutButtonLabels } from "../_components/checkout-button";
import type { PlanFormLabels } from "../_components/plan-form";

/**
 * Your plan, checkout and billing, in the viewer's language (story 22-004).
 *
 * Server code only. Every amount is still the catalogue's or the ledger's,
 * written by `formatPrice` exactly as before; only the words around it are
 * translated. Provider names (Razorpay, Stripe) and plan names are never
 * translated.
 */

/** "₹299 a month", "₹2,870 a year" — a catalogue price in words. */
export function planPriceText(t: Translate, line: PriceLine): string {
  const price = formatPrice(line.amount, line.currency);
  return line.interval === "year" ? t("settingsPage.plan.perYear", { price }) : t("settingsPage.plan.perMonth", { price });
}

/** The arithmetic behind a yearly price, stated as arithmetic. */
export function planPriceNote(t: Translate, line: PriceLine): string | null {
  if (line.interval !== "year" || line.perMonth === null) return null;
  const perMonth = t("settingsPage.plan.perMonth", { price: formatPrice(line.perMonth, line.currency) });
  return line.savingPercent ? t("settingsPage.plan.saveNote", { perMonth, percent: line.savingPercent }) : perMonth;
}

export function planFormLabels(t: Translate): PlanFormLabels {
  return {
    earlyAccess: t("settingsPage.plan.earlyAccess"),
    current: t("settingsPage.plan.current"),
    checking: t("settingsPage.checking"),
    seeChanges: t("settingsPage.plan.seeChanges"),
    changed: t("settingsPage.plan.changed"),
    movingTo: t("settingsPage.plan.movingTo", { plan: "{plan}" }),
    cantBuy: t("settingsPage.plan.cantBuy"),
    openingPayment: t("settingsPage.plan.openingPayment"),
    changing: t("settingsPage.plan.changing"),
    continueToPayment: t("settingsPage.plan.continueToPayment"),
    understandChange: t("settingsPage.plan.understandChange"),
    change: t("settingsPage.plan.change"),
    leave: t("settingsPage.plan.leave"),
    workOutFailed: t("settingsPage.plan.workOutFailed"),
    changeFailed: t("settingsPage.plan.changeFailed"),
  };
}

/** Cancelling at the end of the period, with the plan and its end date already in the sentence. */
export function cancelPlanLabels(t: Translate, plan: string, endsOn: string | null): CancelPlanLabels {
  return {
    cancel: t("settingsPage.plan.cancel"),
    explain: endsOn ? t("settingsPage.plan.cancelUntil", { plan, date: endsOn }) : t("settingsPage.plan.cancelUntilPaid", { plan }),
    cancelling: t("settingsPage.plan.cancelling"),
    keep: t("settingsPage.plan.keep", { plan }),
    failed: t("settingsPage.plan.cancelFailed"),
  };
}

export function checkoutButtonLabels(t: Translate, provider: string): CheckoutButtonLabels {
  return {
    go: t("settingsPage.plan.continueToPayment"),
    opening: t("settingsPage.checkout.opening", { provider }),
    failed: t("settingsPage.checkout.openFailed"),
  };
}

/** What a provider's own page lets a household pay with, as a sentence. */
export function providerMethods(t: Translate, provider: PaymentProviderName): string {
  return t(`settingsPage.checkout.methods.${provider}`);
}

type StatusWord = "succeeded" | "refunded" | "partially_refunded" | "failed" | "cancelled" | "requires_action" | "processing";
const STATUS_WORDS: readonly StatusWord[] = ["succeeded", "refunded", "partially_refunded", "failed", "cancelled", "requires_action"];

/** A payment's state in words, with the same tone the ledger's closed word always had (mirrors `paymentStatusWords`). */
export function paymentStatus(t: Translate, status: PaymentStatus): { label: string; tone: ReturnType<typeof paymentStatusWords>["tone"] } {
  const word: StatusWord = (STATUS_WORDS as readonly string[]).includes(status) ? (status as StatusWord) : "processing";
  return { label: t(`settingsPage.billing.status.${word}`), tone: paymentStatusWords(status).tone };
}

const METHODS = ["card", "upi", "netbanking", "wallet", "emi", "bank_transfer", "other"] as const;
type MethodWord = (typeof METHODS)[number];

/** "Card •••• 4242", "UPI" — the method and at most the last four digits we were told (mirrors `methodWords`). */
export function paymentMethodWords(t: Translate, method: string | null, last4: string | null): string | null {
  if (!method) return null;
  const known: MethodWord = (METHODS as readonly string[]).includes(method) ? (method as MethodWord) : "other";
  const word = t(`settingsPage.billing.method.${known}`);
  return last4 ? `${word} •••• ${last4}` : word;
}
