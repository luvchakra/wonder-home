import { Receipt, Sparkles } from "lucide-react";

import { bestYearlySaving, DEFAULT_PRICE_CURRENCY, formatPrice, listBillingHistory, loadBillingTerms, priceLines, type PriceLine } from "@wonderhome/core/billing/account";
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
import { formatDate, requireSession } from "../../_lib/session";

export const metadata = { title: "Your plan" };
export const dynamic = "force-dynamic";

/** "₹299 a month", "₹2,870 a year" — a catalogue price in words. */
function priceText(line: PriceLine): string {
  return `${formatPrice(line.amount, line.currency)} ${line.interval === "year" ? "a year" : "a month"}`;
}

/** The arithmetic behind a yearly price, stated as arithmetic. */
function priceNote(line: PriceLine): string | null {
  if (line.interval !== "year" || line.perMonth === null) return null;
  const perMonth = `${formatPrice(line.perMonth, line.currency)} a month`;
  return line.savingPercent ? `${perMonth} · save ${line.savingPercent}%` : perMonth;
}

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

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings", label: "Back to settings" }} title="Your plan">
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Your plan</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{membership.household.name} is on the {current} plan.</p>
        </header>

        {/* Back from the payment provider without paying (story 20-006). */}
        {checkout === "cancelled" ? <Alert tone="info">No payment was taken, and your plan is as it was.</Alert> : null}

        {/* The plan the household is on, and what it costs — the primary card (rule 19). */}
        <Card className="flex gap-3.5 p-4">
          <IconTile icon={Sparkles} tone="ai" size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {current}
              {terms?.status === "past_due" ? <Badge tone="attention">Payment due</Badge> : null}
              {terms?.cancelAtPeriodEnd ? <Badge tone="neutral">Ends with this period</Badge> : null}
              {!paid && currentPrice?.earlyAccess ? <Badge tone="handled">Free during early access</Badge> : null}
            </p>
            {paid && terms?.amount !== null && terms?.currency ? (
              <p className="text-sm">
                <span className="font-semibold">{formatPrice(terms.amount, terms.currency)}</span> {terms.interval === "year" ? "a year" : "a month"}
              </p>
            ) : currentPrice ? (
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {priceText(currentPrice)} once payments open. Until then, nothing is charged.
              </p>
            ) : (
              <p className="text-sm text-[var(--wh-foreground-muted)]">Free, always. Nothing is charged.</p>
            )}
            {paid && terms?.periodEnd ? (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">
                {terms.cancelAtPeriodEnd
                  ? `${current} stays until ${formatDate(timezone, terms.periodEnd, "long")}, then the household moves to Free. Nothing is deleted.`
                  : `Renews on ${formatDate(timezone, terms.periodEnd, "long")}.`}
              </p>
            ) : null}
            {terms?.status === "past_due" ? (
              <p className="text-xs text-[var(--wh-foreground-muted)]">
                The last payment didn&rsquo;t go through. Your plan stays while it is tried again.
              </p>
            ) : null}
            {manages && paid && !terms?.cancelAtPeriodEnd ? (
              <CancelPlanButton householdId={householdId} planName={current} endsOn={terms?.periodEnd ? formatDate(timezone, terms.periodEnd, "long") : null} />
            ) : null}
          </div>
        </Card>

        {metered.length > 0 || trialLines.length > 0 ? (
          <section>
            <SectionHeader title="Usage this period" />
            <MetricGrid
              metrics={metered.map((feature) =>
                feature.limit !== null
                  ? { label: `${feature.label} this period`, value: `${feature.used} / ${feature.limit}` }
                  : { label: `${feature.label} this period, fair use ${feature.fairUseLimit}`, value: `${feature.used}` },
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
            <SectionHeader title="Choose your plan" />
            {prices.length > 0 ? (
              <SegmentedControl
                label="Billing period"
                active={interval}
                segments={[
                  { key: "month", label: "Monthly", href: "/settings/plan?interval=month" },
                  { key: "year", label: saving ? `Yearly · save ${saving}%` : "Yearly", href: "/settings/plan?interval=year" },
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
                      priceText: line ? priceText(line) : key === "free" ? formatPrice(0, DEFAULT_PRICE_CURRENCY) : null,
                      priceNote: line ? priceNote(line) : null,
                      earlyAccess: line?.earlyAccess ?? false,
                      priceId: line?.priceId ?? null,
                    };
                  })}
                />
              ) : (
                <p className="text-sm text-[var(--wh-foreground-muted)]">This household is on the {current} plan. An Admin can change it.</p>
              )}
              <p className="text-xs text-[var(--wh-foreground-subtle)]">
                Changing plans never removes anything your household has. A smaller plan stops some things from growing; nothing already recorded is deleted.
              </p>
            </Card>
          </section>
        ) : null}

        {manages ? (
          <section>
            <SectionHeader title="Billing" />
            <Card className="p-2">
              <ul>
                <NavRow
                  icon={Receipt}
                  tone="money"
                  title="Billing history"
                  meta={
                    lastPayment?.amount !== null && lastPayment?.amount !== undefined && lastPayment.currency
                      ? `Last payment ${formatPrice(lastPayment.amount, lastPayment.currency)} on ${formatDate(timezone, lastPayment.paidAt ?? lastPayment.createdAt)}`
                      : "No payments yet"
                  }
                  href="/settings/plan/billing"
                />
              </ul>
            </Card>
          </section>
        ) : null}

        <QuoteCard>Pay for what helps. Keep what&rsquo;s yours.</QuoteCard>
      </div>
    </AppShell>
  );
}
