import { ExternalLink, FileText, Lock } from "lucide-react";

import { formatPrice, loadInvoice, PROVIDER_METHODS } from "@wonderhome/core/billing/account";
import { listPlans } from "@wonderhome/core/billing/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { paymentMethodWords, paymentStatus } from "../../../../_lib/plan-labels";
import { formatDate, requireSession } from "../../../../_lib/session";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

/**
 * One invoice (story 20-010): what the provider issued, in our words, with a
 * link to the provider's own copy — the document of record for tax. Nothing
 * here is computed that the provider did not report.
 */
export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const [{ invoiceId }, session] = await Promise.all([params, requireSession("/settings/plan/billing")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const timezone = membership.household.timezone;
  const manages = view.permissions.includes("household.manage");
  const { t } = session.locale;
  const [invoice, plans] = manages
    ? await Promise.all([loadInvoice(supabase, membership.household.id, invoiceId).catch(() => null), listPlans(supabase).catch(() => [])])
    : [null, []];

  const shell = (children: React.ReactNode) => (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings/plan/billing", label: t("settingsPage.invoice.back") }} title={t("settingsPage.invoice.title")}>
      <div className="space-y-6">{children}</div>
    </AppShell>
  );

  if (!manages) return shell(<EmptyState icon={Lock} title={t("settingsPage.billing.adminOnly")} description={t("settingsPage.billing.adminOnlyBody")} />);
  if (!invoice) {
    return shell(
      <EmptyState
        icon={FileText}
        title={t("settingsPage.invoice.notFound")}
        description={t("settingsPage.invoice.notFoundBody")}
        action={<ButtonLink href="/settings/plan/billing" variant="secondary">{t("settingsPage.invoice.back")}</ButtonLink>}
      />,
    );
  }

  const planName = plans.find((plan) => plan.key === invoice.planKey)?.name ?? "WonderHome";
  const rows: [string, string][] = [
    [t("settingsPage.invoice.plan"), planName],
    [t("settingsPage.invoice.issued"), formatDate(timezone, invoice.issuedAt, "long")],
    ...(invoice.periodStart && invoice.periodEnd
      ? ([[t("settingsPage.invoice.covers"), `${formatDate(timezone, invoice.periodStart, "long")} – ${formatDate(timezone, invoice.periodEnd, "long")}`]] as [string, string][])
      : []),
    ...(invoice.payment?.method
      ? ([[t("settingsPage.invoice.paidWith"), paymentMethodWords(t, invoice.payment.method, invoice.payment.last4) ?? ""]] as [string, string][])
      : []),
    [t("settingsPage.invoice.provider"), PROVIDER_METHODS[invoice.provider].name],
  ];
  // A paid invoice already says "Paid"; a payment in any other state is shown beside it.
  const payment = invoice.payment && invoice.payment.status !== "succeeded" ? paymentStatus(t, invoice.payment.status) : null;

  return shell(
    <>
      <header className="wh-rise">
        <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">
          {invoice.number ? t("settingsPage.invoice.numbered", { number: invoice.number }) : t("settingsPage.invoice.title")}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.invoice.for", { household: membership.household.name })}</p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3.5">
          <IconTile icon={FileText} tone="money" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold">{invoice.amount !== null && invoice.currency ? formatPrice(invoice.amount, invoice.currency) : "—"}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone={invoice.status === "paid" ? "handled" : invoice.status === "open" ? "attention" : "neutral"}>
                {t(`settingsPage.invoice.status.${invoice.status}`)}
              </Badge>
              {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : null}
            </div>
          </div>
        </div>
        <dl className="divide-y divide-[var(--wh-border)] text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2.5">
              <dt className="text-[var(--wh-foreground-muted)]">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {invoice.invoiceUrl || invoice.receiptUrl ? (
        <div className="flex flex-wrap gap-2">
          {invoice.invoiceUrl ? (
            <ButtonLink href={invoice.invoiceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden className="size-4" /> {t("settingsPage.invoice.openInvoice")}
            </ButtonLink>
          ) : null}
          {invoice.receiptUrl ? (
            <ButtonLink href={invoice.receiptUrl} target="_blank" rel="noopener noreferrer" variant="secondary">
              <ExternalLink aria-hidden className="size-4" /> {t("settingsPage.invoice.openReceipt")}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("settingsPage.invoice.record")}</p>

      <QuoteCard>{t("settingsPage.plan.quote")}</QuoteCard>
    </>,
  );
}
