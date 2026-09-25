import { ChevronRight, CreditCard, Lock, Receipt } from "lucide-react";
import Link from "next/link";

import { formatPrice, listBillingHistory, PROVIDER_METHODS } from "@wonderhome/core/billing/account";
import { listPlans } from "@wonderhome/core/billing/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import { paymentMethodWords, paymentStatus } from "../../../_lib/plan-labels";
import { formatDate, requireSession } from "../../../_lib/session";

export const metadata = { title: "Billing history" };
export const dynamic = "force-dynamic";

/**
 * Billing history and the payment method (story 20-010, spec §27). Every row
 * is one the provider reported and a verified webhook recorded; the method is
 * the closed word and at most the last four digits we were told. The card or
 * UPI details themselves live with the provider — WonderHome never had them.
 */
export default async function BillingHistoryPage() {
  const session = await requireSession("/settings/plan/billing");
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const manages = view.permissions.includes("household.manage");
  const { t } = session.locale;

  const shell = (children: React.ReactNode) => (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings/plan", label: t("settingsPage.plan.back") }} title={t("settingsPage.plan.history")}>
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.plan.history")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.billing.lede", { household: membership.household.name })}</p>
        </header>
        {children}
        <QuoteCard>{t("settingsPage.plan.quote")}</QuoteCard>
      </div>
    </AppShell>
  );

  if (!manages) {
    return shell(<EmptyState icon={Lock} title={t("settingsPage.billing.adminOnly")} description={t("settingsPage.billing.adminOnlyBody")} />);
  }

  const [history, plans] = await Promise.all([listBillingHistory(supabase, householdId).catch(() => null), listPlans(supabase).catch(() => [])]);
  if (history === null) {
    return shell(<ErrorState title={t("settingsPage.billing.loadError")} description={t("settingsPage.billing.loadErrorBody")} />);
  }
  const planName = (key: string | null) => plans.find((plan) => plan.key === key)?.name ?? "WonderHome";
  const method = history.find((entry) => entry.status === "succeeded" && entry.method) ?? null;

  return shell(
    <>
      <section>
        <SectionHeader title={t("settingsPage.billing.method")} />
        <Card className="flex items-start gap-3 p-4">
          <IconTile icon={CreditCard} tone="money" />
          <div className="min-w-0 flex-1">
            {method ? (
              <>
                <p className="text-sm font-semibold">{paymentMethodWords(t, method.method, method.last4)}</p>
                <p className="text-sm text-[var(--wh-foreground-muted)]">
                  {t("settingsPage.billing.methodUsed", { provider: PROVIDER_METHODS[method.provider].name })}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">{t("settingsPage.billing.methodNone")}</p>
                <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.billing.methodNoneBody")}</p>
              </>
            )}
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title={t("settingsPage.billing.payments")} />
        {history.length === 0 ? (
          <EmptyState
            icon={Receipt}
            tone="money"
            title={t("settingsPage.plan.noPayments")}
            description={t("settingsPage.billing.emptyBody")}
          />
        ) : (
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {history.map((entry) => {
                const status = paymentStatus(t, entry.status);
                const methodText = paymentMethodWords(t, entry.method, entry.last4);
                const body = (
                  <>
                    <IconTile icon={Receipt} tone="money" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{planName(entry.planKey)}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                        {formatDate(timezone, entry.paidAt ?? entry.createdAt, "long")}
                        {methodText ? ` · ${methodText}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold">{entry.amount !== null && entry.currency ? formatPrice(entry.amount, entry.currency) : "—"}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                    {entry.invoiceId ? <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] rtl:rotate-180" /> : null}
                  </>
                );
                return (
                  <li key={entry.id}>
                    {entry.invoiceId ? (
                      <Link href={`/settings/plan/billing/${entry.invoiceId}`} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-1 py-2.5 hover:bg-[var(--wh-surface-muted)]">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 px-1 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </>,
  );
}
