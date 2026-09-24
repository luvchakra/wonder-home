import { ExternalLink, FileText, Lock } from "lucide-react";

import { formatPrice, loadInvoice, methodWords, paymentStatusWords, PROVIDER_METHODS } from "@wonderhome/core/billing/account";
import { listPlans } from "@wonderhome/core/billing/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { formatDate, requireSession } from "../../../../_lib/session";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const INVOICE_WORDS = { paid: "Paid", open: "Awaiting payment", void: "Void", uncollectible: "Not collected" } as const;

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
  const [invoice, plans] = manages
    ? await Promise.all([loadInvoice(supabase, membership.household.id, invoiceId).catch(() => null), listPlans(supabase).catch(() => [])])
    : [null, []];

  const shell = (children: React.ReactNode) => (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings/plan/billing", label: "Back to billing history" }} title="Invoice">
      <div className="space-y-6">{children}</div>
    </AppShell>
  );

  if (!manages) return shell(<EmptyState icon={Lock} title="Only an Admin can see billing" description="Payments are between the household's Admins and the payment provider." />);
  if (!invoice) {
    return shell(
      <EmptyState icon={FileText} title="We couldn't find that invoice" description="It may belong to another household, or it hasn't arrived from the provider yet." action={<ButtonLink href="/settings/plan/billing" variant="secondary">Back to billing history</ButtonLink>} />,
    );
  }

  const planName = plans.find((plan) => plan.key === invoice.planKey)?.name ?? "WonderHome";
  const rows: [string, string][] = [
    ["Plan", planName],
    ["Issued", formatDate(timezone, invoice.issuedAt, "long")],
    ...(invoice.periodStart && invoice.periodEnd
      ? ([["Covers", `${formatDate(timezone, invoice.periodStart, "long")} – ${formatDate(timezone, invoice.periodEnd, "long")}`]] as [string, string][])
      : []),
    ...(invoice.payment?.method ? ([["Paid with", methodWords(invoice.payment.method, invoice.payment.last4) ?? ""]] as [string, string][]) : []),
    ["Payment provider", PROVIDER_METHODS[invoice.provider].name],
  ];
  const paymentStatus = invoice.payment ? paymentStatusWords(invoice.payment.status) : null;

  return shell(
    <>
      <header className="wh-rise">
        <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{invoice.number ? `Invoice ${invoice.number}` : "Invoice"}</h1>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">For {membership.household.name}.</p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3.5">
          <IconTile icon={FileText} tone="money" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold">{invoice.amount !== null && invoice.currency ? formatPrice(invoice.amount, invoice.currency) : "—"}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone={invoice.status === "paid" ? "handled" : invoice.status === "open" ? "attention" : "neutral"}>{INVOICE_WORDS[invoice.status]}</Badge>
              {paymentStatus && paymentStatus.label !== "Paid" ? <Badge tone={paymentStatus.tone}>{paymentStatus.label}</Badge> : null}
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
              <ExternalLink aria-hidden className="size-4" /> Open the invoice
            </ButtonLink>
          ) : null}
          {invoice.receiptUrl ? (
            <ButtonLink href={invoice.receiptUrl} target="_blank" rel="noopener noreferrer" variant="secondary">
              <ExternalLink aria-hidden className="size-4" /> Open the receipt
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        The provider&rsquo;s own copy is the document of record, including any tax shown on it.
      </p>

      <QuoteCard>Pay for what helps. Keep what&rsquo;s yours.</QuoteCard>
    </>,
  );
}
