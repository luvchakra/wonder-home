import { describeTrial } from "@wonderhome/core/billing/experiments";
import { listPlans, loadSubscription, usageSummary } from "@wonderhome/core/billing/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { PlanForm } from "../../_components/plan-form";
import { requireSession } from "../../_lib/session";

export const metadata = { title: "Your plan" };
export const dynamic = "force-dynamic";

/**
 * The plan and what it has used this period (Settings consolidation): the
 * one place a plan is changed. `PlanForm` and its API route stay the only
 * write path; entitlements everywhere else read from the same subscription.
 */
export default async function PlanSettingsPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [{ checkout }, session] = await Promise.all([searchParams, requireSession("/settings/plan")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const [subscription, plans, usage] = await Promise.all([
    loadSubscription(supabase, householdId).catch(() => null),
    listPlans(supabase).catch(() => []),
    usageSummary(supabase, householdId).catch(() => ({ planKey: null, features: [] })),
  ]);
  // Only what is actually counted — an unlimited feature with no fair-use
  // level has no "used of" to show, and "used of unlimited" is not
  // arithmetic anybody asked for.
  const metered = usage.features.filter((feature) => feature.used !== null && (feature.limit !== null || feature.fairUseLimit !== null));
  // What the plan says about spikes and heavy use (story 20-007), in words.
  const policyLines = usage.features.flatMap((feature) => feature.policies);
  // A trial is never hidden from the household it applies to (story 20-008).
  const trialLines = usage.features.filter((feature) => feature.trial).map((feature) => describeTrial(feature.featureKey));
  const manages = view.permissions.includes("household.manage");
  const current = plans.find((plan) => plan.key === subscription?.planKey)?.name ?? "Free";

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings", label: "Back to settings" }} title="Your plan">
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Your plan</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{membership.household.name} is on the {current} plan.</p>
        </header>

        {/* Back from the payment provider (story 20-006). The plan changes
            when the provider confirms the payment, not on the redirect — so
            this says what is true, not what is hoped. */}
        {checkout === "complete" ? (
          <Alert tone="info">Thanks — your plan changes as soon as the payment is confirmed, usually within a minute.</Alert>
        ) : checkout === "cancelled" ? (
          <Alert tone="info">No payment was taken, and your plan is as it was.</Alert>
        ) : null}

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
          <section>
            <SectionHeader title="Plans" />
            <Card className="space-y-3 p-4">
              {manages ? (
                <PlanForm
                  householdId={householdId}
                  currentPlanKey={subscription?.planKey ?? null}
                  plans={plans.map(({ key, name, description }) => ({ key, name, description }))}
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

        <QuoteCard>Pay for what helps. Keep what&rsquo;s yours.</QuoteCard>
      </div>
    </AppShell>
  );
}
