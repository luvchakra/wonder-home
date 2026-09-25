import { Receipt, Sparkles } from "lucide-react";

import { bestYearlySaving, DEFAULT_PRICE_CURRENCY, formatPrice, listBillingHistory, loadBillingTerms, priceLines } from "@wonderhome/core/billing/account";
import { describeTrial } from "@wonderhome/core/billing/experiments";
import { listPlanPrices } from "@wonderhome/core/billing/prices";
import type { BillingInterval } from "@wonderhome/core/billing/provider";
import { listPlans, loadSubscription, usageSummary } from "@wonderhome/core/billing/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { NavRow } from "@wonderhome/core/ui/action-row";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";

import { CancelPlanButton } from "../../_components/cancel-plan-button";
import { PlanForm } from "../../_components/plan-form";
import { cancelPlanLabels, planFormLabels, planPriceNote, planPriceText } from "../../_lib/plan-labels";
import { formatDate, requireSession } from "../../_lib/session";

export const metadata = { title: "Your plan" };
export const dynamic = "force-dynamic";

/**
 * The plan, what it costs, and what it has used this period (story 20-010):
 * the one place a plan is changed. `PlanForm` and its API route stay the only
 * write path; entitlements everywhere else read from the same subscription.
 * Every price here is the catalogue's, every payment the ledger's.
 */
export default async function PlanSettingsPage({ searchParams }: { searchParams: Promise<{ checkout?: string; interval?: string }> }) {
  const [{ checkout, interval: requested }, session] = await Promise.all([searchParams, requireSession("/settings/plan")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const interval: BillingInterval = requested === "year" ? "year" : "month";
  const manages = view.permissions.includes("household.manage");
  const [subscription, plans, usage, prices, terms, history] = await Promise.all([
    loadSubscription(supabase, householdId).catch(() => null),
    listPlans(supabase).catch(() => []),
    usageSummary(supabase, householdId).catch(() => ({ planKey: null, features: [] })),
    listPlanPrices(supabase).catch(() => []),
    loadBillingTerms(supabase, householdId).catch(() => null),
    // The ledger answers only an Admin; anyone else simply has no billing row.
    manages ? listBillingHistory(supabase, householdId, 1).catch(() => []) : Promise.resolve([]),
  ]);
  // Only what is actually counted — an unlimited feature with no fair-use
  // level has no "used of" to show, and "used of unlimited" is not
  // arithmetic anybody asked for.
  const metered = usage.features.filter((feature) => feature.used !== null && (feature.limit !== null || feature.fairUseLimit !== null));
  // What the plan says about spikes and heavy use (story 20-007), in words.
  const policyLines = usage.features.flatMap((feature) => feature.policies);
  // A trial is never hidden from the household it applies to (story 20-008).
  const trialLines = usage.features.filter((feature) => feature.trial).map((feature) => describeTrial(feature.featureKey));
  const tiers = plans.map((plan) => ({ key: plan.key, name: plan.name, requiresPayment: plan.requiresPayment }));
  const lines = priceLines(tiers, prices, interval);
  const currentLines = priceLines(tiers, prices, terms?.interval ?? "month");
  const saving = bestYearlySaving(tiers, prices);
  const currentKey = subscription?.planKey ?? terms?.planKey ?? "free";
  const current = plans.find((plan) => plan.key === currentKey)?.name ?? "Free";
  const currentPrice = currentLines[currentKey] ?? null;
  const paid = Boolean(terms?.provider && terms.amount !== null && terms.currency);
  const lastPayment = history[0] ?? null;
  const { t } = session.locale;
  const endsOn = terms?.periodEnd ? formatDate(timezone, terms.periodEnd, "long") : null;
  // The paid amount keeps its emphasis wherever the sentence puts it.
  const [paidBefore, paidAfter] = t(terms?.interval === "year" ? "settingsPage.plan.perYear" : "settingsPage.plan.perMonth", { price: "{price}" }).split("{price}");

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings", label: t("settingsPage.backToSettings") }} title={t("settingsPage.plan.title")}>
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.plan.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.plan.lede", { household: membership.household.name, plan: current })}</p>
        </header>

        {/* Back from the payment provider without paying (story 20-006). */}
        {checkout === "cancelled" ? <Alert tone="info">{t("settingsPage.plan.checkoutCancelled")}</Alert> : null}

        {/* The plan the household is on, and what it costs — the primary card (rule 19). */}
        <Card className="flex gap-3.5 p-4">
          <IconTile icon={Sparkles} tone="ai" size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {current}
              {terms?.status === "past_due" ? <Badge tone="attention">{t("settingsPage.plan.badge.pastDue")}</Badge> : null}
              {terms?.cancelAtPeriodEnd ? <Badge tone="neutral">{t("settingsPage.plan.badge.endsWithPeriod")}</Badge> : null}
              {!paid && currentPrice?.earlyAccess ? <Badge tone="handled">{t("settingsPage.plan.earlyAccess")}</Badge> : null}
            </p>
            {paid && terms?.amount !== null && terms?.currency ? (
              <p className="text-sm">
                {paidBefore}
                <span className="font-semibold">{formatPrice(terms.amount, terms.currency)}</span>
                {paidAfter}
              </p>
            ) : currentPrice ? (
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {t("settingsPage.plan.oncePaymentsOpen", { price: planPriceText(t, currentPrice) })}
              </p>
            ) : (
              <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.plan.freeAlways")}</p>
            )}
            {paid && terms?.periodEnd ? (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">
                {terms.cancelAtPeriodEnd
                  ? t("settingsPage.plan.staysUntil", { plan: current, date: formatDate(timezone, terms.periodEnd, "long") })
                  : t("settingsPage.plan.renews", { date: formatDate(timezone, terms.periodEnd, "long") })}
              </p>
            ) : null}
            {terms?.status === "past_due" ? (
              <p className="text-xs text-[var(--wh-foreground-muted)]">{t("settingsPage.plan.pastDue")}</p>
            ) : null}
            {manages && paid && !terms?.cancelAtPeriodEnd ? (
              <CancelPlanButton householdId={householdId} labels={cancelPlanLabels(t, current, endsOn)} />
            ) : null}
          </div>
        </Card>

        {metered.length > 0 || trialLines.length > 0 ? (
          <section>
            <SectionHeader title={t("settingsPage.plan.usage")} />
            <MetricGrid
              metrics={metered.map((feature) =>
                feature.limit !== null
                  ? { label: t("settingsPage.plan.usageLimit", { feature: feature.label }), value: `${feature.used} / ${feature.limit}` }
                  : { label: t("settingsPage.plan.usageFairUse", { feature: feature.label, limit: feature.fairUseLimit ?? "" }), value: `${feature.used}` },
              )}
            />
            {policyLines.length + trialLines.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-[var(--wh-foreground-muted)]">
                {[...policyLines, ...trialLines].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {plans.length > 0 ? (
          <section className="space-y-3">
            <SectionHeader title={t("settingsPage.plan.choose")} />
            {prices.length > 0 ? (
              <SegmentedControl
                label={t("settingsPage.plan.period")}
                active={interval}
                segments={[
                  { key: "month", label: t("settingsPage.plan.monthly"), href: "/settings/plan?interval=month" },
                  {
                    key: "year",
                    label: saving ? t("settingsPage.plan.yearlySave", { percent: saving }) : t("settingsPage.plan.yearly"),
                    href: "/settings/plan?interval=year",
                  },
                ]}
              />
            ) : null}
            <Card className="space-y-3 p-4">
              {manages ? (
                <PlanForm
                  householdId={householdId}
                  currentPlanKey={subscription?.planKey ?? null}
                  plans={plans.map(({ key, name, description }) => {
                    const line = lines[key] ?? null;
                    return {
                      key,
                      name,
                      description,
                      priceText: line ? planPriceText(t, line) : key === "free" ? formatPrice(0, DEFAULT_PRICE_CURRENCY) : null,
                      priceNote: line ? planPriceNote(t, line) : null,
                      earlyAccess: line?.earlyAccess ?? false,
                      priceId: line?.priceId ?? null,
                    };
                  })}
                  labels={planFormLabels(t)}
                />
              ) : (
                <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.plan.nonAdmin", { plan: current })}</p>
              )}
              <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("settingsPage.plan.neverRemoves")}</p>
            </Card>
          </section>
        ) : null}

        {manages ? (
          <section>
            <SectionHeader title={t("settingsPage.plan.billing")} />
            <Card className="p-2">
              <ul>
                <NavRow
                  icon={Receipt}
                  tone="money"
                  title={t("settingsPage.plan.history")}
                  meta={
                    lastPayment?.amount !== null && lastPayment?.amount !== undefined && lastPayment.currency
                      ? t("settingsPage.plan.lastPayment", {
                          amount: formatPrice(lastPayment.amount, lastPayment.currency),
                          date: formatDate(timezone, lastPayment.paidAt ?? lastPayment.createdAt),
                        })
                      : t("settingsPage.plan.noPayments")
                  }
                  href="/settings/plan/billing"
                />
              </ul>
            </Card>
          </section>
        ) : null}

        <QuoteCard>{t("settingsPage.plan.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
