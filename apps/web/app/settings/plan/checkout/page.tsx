import { CircleCheck, Globe, Lock, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { checkoutOption, formatPrice, priceLines, PROVIDER_METHODS } from "@wonderhome/core/billing/account";
import { describe } from "@wonderhome/core/billing/entitlements";
import { listPlanPrices } from "@wonderhome/core/billing/prices";
import { listPlans } from "@wonderhome/core/billing/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { isRegion } from "@wonderhome/core/i18n/locales";
import { regionName } from "@wonderhome/core/i18n/options";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { CheckoutButton } from "../../../_components/checkout-button";
import { checkoutButtonLabels, providerMethods } from "../../../_lib/plan-labels";
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
  const { t, preferences } = session.locale;
  const region = isRegion(regionCode) ? regionName(regionCode, preferences.language) : null;

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
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings/plan", label: t("settingsPage.plan.back") }} title={t("settingsPage.checkout.title")}>
      <div className="space-y-6">{children}</div>
    </AppShell>
  );

  if (!manages) {
    return shell(<EmptyState icon={Lock} title={t("settingsPage.checkout.adminOnly")} description={t("settingsPage.checkout.adminOnlyBody")} />);
  }

  if (!plan || !option || !option.price) {
    return shell(
      <EmptyState
        icon={Sparkles}
        title={t("settingsPage.checkout.noPrice")}
        description={t("settingsPage.checkout.noPriceBody")}
        action={<ButtonLink href="/settings/plan" variant="secondary">{t("settingsPage.plan.back")}</ButtonLink>}
      />,
    );
  }

  if (!option.ready) {
    const earlyAccess = option.reason === "not_paid_yet";
    return shell(
      <EmptyState
        icon={Sparkles}
        tone="ai"
        title={earlyAccess ? t("settingsPage.checkout.earlyAccess", { plan: plan.name }) : t("settingsPage.checkout.notOpen")}
        description={
          earlyAccess ? t("settingsPage.checkout.earlyAccessBody", { plan: plan.name }) : t("settingsPage.checkout.notOpenBody", { plan: plan.name })
        }
        action={<ButtonLink href="/settings/plan" variant="secondary">{t("settingsPage.plan.back")}</ButtonLink>}
      />,
    );
  }

  const provider = PROVIDER_METHODS[option.provider];
  const price = option.price;
  return shell(
    <>
      <header className="wh-rise">
        <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.checkout.title")}</h1>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.checkout.lede")}</p>
      </header>

      {/* What is being bought — the primary card (rule 19). */}
      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3.5">
          <IconTile icon={Sparkles} tone="ai" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{plan.name}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {price.interval === "year" ? t("settingsPage.checkout.billedYearly") : t("settingsPage.checkout.billedMonthly")}
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-xl font-bold">{formatPrice(price.amount, price.currency)}</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">
              {price.interval === "year" ? t("settingsPage.checkout.aYear") : t("settingsPage.checkout.aMonth")}
            </span>
          </p>
        </div>
        {line?.perMonth !== null && line?.perMonth !== undefined ? (
          <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-handled-soft)] px-3 py-2 text-sm text-[var(--wh-handled)]">
            {line.savingPercent
              ? t("settingsPage.checkout.perMonthSaving", { price: formatPrice(line.perMonth, price.currency), percent: line.savingPercent })
              : t("settingsPage.checkout.perMonth", { price: formatPrice(line.perMonth, price.currency) })}
          </p>
        ) : null}
        {includes.length > 0 ? (
          <div>
            <p className="text-sm font-semibold">{t("settingsPage.checkout.includes")}</p>
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
            <p className="text-sm font-semibold">{t("settingsPage.checkout.region")}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {region ? `${region} · ` : ""}
              {price.currency}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4">
          <IconTile icon={ShieldCheck} tone="primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("settingsPage.checkout.paidWith", { provider: provider.name })}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{providerMethods(t, option.provider)}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <CheckoutButton householdId={householdId} planKey={plan.key} priceId={price.id} labels={checkoutButtonLabels(t, provider.name)} />
        <p className="text-center text-xs text-[var(--wh-foreground-subtle)]">{t("settingsPage.checkout.providerPage", { provider: provider.name })}</p>
        <p className="text-center text-sm">
          <Link href="/settings/plan" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
            {t("settingsPage.checkout.notNow")}
          </Link>
        </p>
      </div>

      <QuoteCard>{t("settingsPage.plan.quote")}</QuoteCard>
    </>,
  );
}
