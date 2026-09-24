import { CircleCheck, Globe, Lock, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { checkoutOption, formatPrice, priceLines, PROVIDER_METHODS } from "@wonderhome/core/billing/account";
import { describe } from "@wonderhome/core/billing/entitlements";
import { listPlanPrices } from "@wonderhome/core/billing/prices";
import { listPlans } from "@wonderhome/core/billing/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { isRegion, regionInfo } from "@wonderhome/core/i18n/locales";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { CheckoutButton } from "../../../_components/checkout-button";
import { requireSession } from "../../../_lib/session";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

/**
 * The checkout summary (story 20-010, spec §29): what is being bought, what it
 * costs, in which currency, and who takes the payment — before anyone leaves
 * for a provider's page. The price is the catalogue's; the provider is the
 * router's; the browser only chooses. When nothing can take the payment yet,
 * the page says so instead of offering a button that goes nowhere (rule 10).
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; price?: string }> }) {
  const [{ plan: planKey, price: priceId }, session] = await Promise.all([searchParams, requireSession("/settings/plan/checkout")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const manages = view.permissions.includes("household.manage");
  const regionCode = membership.locale?.household.region ?? null;
  const region = isRegion(regionCode) ? regionInfo(regionCode) : null;

  const [plans, prices] = await Promise.all([listPlans(supabase).catch(() => []), listPlanPrices(supabase).catch(() => [])]);
  const plan = plans.find((candidate) => candidate.key === planKey) ?? null;
  const option =
    plan && priceId && manages
      ? await checkoutOption(supabase, createAdminClient(), { priceId, planKey: plan.key, requiresPayment: plan.requiresPayment, country: regionCode }).catch(() => null)
      : null;
  const line = option?.price && plan ? priceLines([{ key: plan.key, name: plan.name, requiresPayment: plan.requiresPayment }], prices, option.price.interval)[plan.key] : null;
  const { data: featureRows } = plan ? await supabase.from("plan_features").select("feature_key").eq("plan_key", plan.key).eq("enabled", true) : { data: null };
  const includes = ((featureRows as { feature_key: string }[] | null) ?? []).map((row) => describe(row.feature_key)).slice(0, 6);

  const shell = (children: React.ReactNode) => (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings/plan", label: "Back to your plan" }} title="Checkout">
      <div className="space-y-6">{children}</div>
    </AppShell>
  );

  if (!manages) {
    return shell(<EmptyState icon={Lock} title="Only an Admin can change the plan" description="Ask an Admin of your household to choose a plan." />);
  }

  if (!plan || !option || !option.price) {
    return shell(
      <EmptyState
        icon={Sparkles}
        title="That price isn't available"
        description="Choose a plan again and we'll show you what it costs."
        action={<ButtonLink href="/settings/plan" variant="secondary">Back to your plan</ButtonLink>}
      />,
    );
  }

  if (!option.ready) {
    const earlyAccess = option.reason === "not_paid_yet";
    return shell(
      <EmptyState
        icon={Sparkles}
        tone="ai"
        title={earlyAccess ? `${plan.name} is free during early access` : "Payments aren't open yet"}
        description={
          earlyAccess
            ? `You can move to ${plan.name} now without paying — nothing is charged until payments open, and we'll tell you before anything changes.`
            : `${plan.name} can't be bought here yet. Nothing has been charged, and your plan is as it was.`
        }
        action={<ButtonLink href="/settings/plan" variant="secondary">Back to your plan</ButtonLink>}
      />,
    );
  }

  const provider = PROVIDER_METHODS[option.provider];
  const price = option.price;
  return shell(
    <>
      <header className="wh-rise">
        <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Checkout</h1>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">One last look before you pay.</p>
      </header>

      {/* What is being bought — the primary card (rule 19). */}
      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3.5">
          <IconTile icon={Sparkles} tone="ai" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{plan.name}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Billed {price.interval === "year" ? "yearly" : "monthly"}</p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-xl font-bold">{formatPrice(price.amount, price.currency)}</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">{price.interval === "year" ? "a year" : "a month"}</span>
          </p>
        </div>
        {line?.perMonth !== null && line?.perMonth !== undefined ? (
          <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-handled-soft)] px-3 py-2 text-sm text-[var(--wh-handled)]">
            That&rsquo;s {formatPrice(line.perMonth, price.currency)} a month{line.savingPercent ? ` — ${line.savingPercent}% less than paying monthly` : ""}.
          </p>
        ) : null}
        {includes.length > 0 ? (
          <div>
            <p className="text-sm font-semibold">Includes</p>
            <ul className="mt-2 space-y-1.5">
              {includes.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-handled)]" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card className="divide-y divide-[var(--wh-border)] p-0">
        <div className="flex items-start gap-3 p-4">
          <IconTile icon={Globe} tone="home" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Region and currency</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {region ? `${region.name} · ` : ""}
              {price.currency}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4">
          <IconTile icon={ShieldCheck} tone="primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Paid securely with {provider.name}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{provider.methods}.</p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <CheckoutButton householdId={householdId} planKey={plan.key} priceId={price.id} providerName={provider.name} />
        <p className="text-center text-xs text-[var(--wh-foreground-subtle)]">
          You&rsquo;ll pay on {provider.name}&rsquo;s own page. WonderHome never sees your card, UPI PIN or bank password. Your plan changes once {provider.name} confirms the payment.
        </p>
        <p className="text-center text-sm">
          <Link href="/settings/plan" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
            Not now
          </Link>
        </p>
      </div>

      <QuoteCard>Pay for what helps. Keep what&rsquo;s yours.</QuoteCard>
    </>,
  );
}
