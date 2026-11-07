import { notFound } from "next/navigation";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { Badge } from "@wonderhome/core/ui/pill";

import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans & billing · Platform admin", robots: { index: false, follow: false } };

type Plan = { key: string; name: string; description: string | null; requires_payment: boolean; active: boolean };
type Price = { plan_key: string; billing_interval: string; currency: string; amount: string | number; active: boolean };
type Feature = { plan_key: string; feature_key: string; enabled: boolean; limit_per_period: number | null; period: string };
type Experiment = { key: string; feature_key: string; description: string; plan_keys: string[]; treatment_percent: number; active?: boolean };

/** Every plan's prices and features, and the running experiments. Prices are ours (docs/external-providers.md). */
export default async function PlatformPlansPage() {
  const staff = await platformStaff("subscription.manage");
  if (!staff) notFound();
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "show plans, prices and experiments"));

  const [plans, prices, features, experiments] = await Promise.all([
    admin.from("plans").select("key, name, description, requires_payment, active").order("sort_order").limit(20),
    admin.from("plan_prices").select("plan_key, billing_interval, currency, amount, active").eq("active", true).limit(100),
    admin.from("plan_features").select("plan_key, feature_key, enabled, limit_per_period, period").order("feature_key").limit(500),
    admin.from("entitlement_experiments").select("*").limit(50),
  ]);
  const priceRows = (prices.data ?? []) as Price[];
  const featureRows = (features.data ?? []) as Feature[];

  return (
    <PageBody>
      <PageTitle title="Plans & billing" subtitle="What each plan costs and includes. A household moves to a paid plan only after a verified payment." />
      {((plans.data ?? []) as Plan[]).map((plan) => {
        const planPrices = priceRows.filter((price) => price.plan_key === plan.key);
        const planFeatures = featureRows.filter((feature) => feature.plan_key === plan.key);
        return (
          <Panel
            key={plan.key}
            title={plan.name}
            description={plan.description ?? undefined}
            action={<span className="flex flex-wrap gap-2">{plan.requires_payment ? <Badge tone="money">Paid</Badge> : <Badge tone="handled">Free</Badge>}{plan.active ? null : <Badge tone="neutral">Retired</Badge>}</span>}
          >
            {planPrices.length > 0 ? (
              <p className="flex flex-wrap gap-2 text-sm">
                {planPrices.map((price) => (
                  <span key={`${price.currency}-${price.billing_interval}`} className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-2 py-1 tabular-nums">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: price.currency }).format(Number(price.amount))} a {price.billing_interval}
                  </span>
                ))}
              </p>
            ) : null}
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {planFeatures.map((feature) => (
                <li key={feature.feature_key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words font-mono text-xs">{feature.feature_key}</span>
                  <span className="shrink-0 text-xs text-[var(--wh-foreground-muted)]">
                    {!feature.enabled ? "Off" : feature.limit_per_period === null ? "Unlimited" : `${feature.limit_per_period} a ${feature.period}`}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
      <Panel title="Experiments" description="A share of households on a plan trying a feature differently.">
        {((experiments.data ?? []) as Experiment[]).length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">No experiment is running.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {((experiments.data ?? []) as Experiment[]).map((experiment) => (
              <li key={experiment.key}>
                <p className="font-semibold break-words">{experiment.key}</p>
                <p className="text-[var(--wh-foreground-muted)]">
                  {experiment.description} {experiment.treatment_percent}% of {experiment.plan_keys.join(", ")} · {experiment.feature_key}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
  );
}
