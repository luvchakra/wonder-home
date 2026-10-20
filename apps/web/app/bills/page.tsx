import {
  CalendarDays,
  CircleCheck,
  Mail,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { listBudgets } from "@wonderhome/core/finance/budget-repository";
import { budgetSpend, type BudgetPayment } from "@wonderhome/core/finance/budgets";
import { describeEmailHealth } from "@wonderhome/core/finance/email-connector";
import { isoDateIn } from "@wonderhome/core/context/format";
import {
  budgetView,
  format as formatMoney,
  type Obligation,
} from "@wonderhome/core/finance/payments";
import { BILL_TYPES } from "@wonderhome/core/finance/bill-catalog";
import { SpendLines, type SpendSeries } from "./spend-lines";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { homePlaceFrom, payeesFor } from "@wonderhome/core/finance/payees";
import { billPeriods, PERIODS_BEHIND, type BillPeriod } from "@wonderhome/core/finance/periods";
import {
  financeAgenda,
  listGivenPeriods,
  listObligations,
} from "@wonderhome/core/finance/repository";
import { loadHouseholdAddress } from "@wonderhome/core/household/address";
import {
  isHouseholdAdmin,
  listMembers,
} from "@wonderhome/core/identity/households";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import {
  ExpandableMetricRow,
  MetricDetailEmpty,
  type ExpandableMetric,
} from "@wonderhome/core/ui/expandable-metric-card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaExpandableRow } from "../_components/agenda-expandable-row";
import {
  AddBillButton,
  AddBudgetButton,
  AddTransactionButton,
  BillPeriodButton,
  BudgetRowControls,
  EditTransactionControl,
  ObligationRowControls,
  RemoveTransactionControl,
  type BillChoices,
  type BillFormLabels,
  type BillPeriodLabels,
} from "../_components/finance-forms";
import { billFormLabels, billKindName } from "../_lib/bill-form-labels";
import { formatDate, requireSession } from "../_lib/session";

export const metadata = { title: "Bills & Finance" };
export const dynamic = "force-dynamic";

type HistoryRow = {
  obligation_id: string;
  period_label: string;
  amount_minor: number;
  currency: string;
  paid_on: string | null;
  payee: string | null;
  kind: string | null;
  owner_member_id: string | null;
};

/**
 * Bills & Finance (requirements §20): Overview and Transactions, plus a light
 * monthly trend. Not a personal-finance app: what is due, who it is on, and
 * whether it is unusual. Paying needs approval and step-up, and no payment
 * provider is live, so "Pay" prepares an intent and stops there.
 */
export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, session] = await Promise.all([
    searchParams,
    requireSession("/bills"),
  ]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/bills",
    back: { href: "/more", label: t("common.back") },
    title: t("nav.item.bills"),
  };

  if (!view.permissions.includes("finance.view")) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={ShieldCheck}
          title={t("bills.notAvailable.title")}
          description={t("bills.notAvailable.lede")}
        />
      </AppShell>
    );
  }

  const entitlement = await may(supabase, householdId, "finance.bills");
  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={Wallet}
          tone="money"
          title={t("bills.notInPlan")}
          description={entitlement.reason}
        />
      </AppShell>
    );
  }

  const active = tab === "transactions" ? "transactions" : "overview";
  const [agenda, obligations, members, historyRows, budgetRows, integrations, address, givenPeriods] =
    await Promise.all([
      financeAgenda(supabase, householdId).catch(() => null),
      listObligations(supabase, householdId).catch(() => []),
      listMembers(
        supabase,
        householdId,
        membership.household.ownerMemberId,
      ).catch(() => []),
      supabase
        .from("obligation_history")
        .select("obligation_id, period_label, amount_minor, currency, paid_on, payee, kind, owner_member_id")
        .eq("household_id", householdId)
        .order("period_label", { ascending: false })
        .limit(120),
      listBudgets(supabase, householdId).catch(() => []),
      listIntegrations(supabase, householdId).catch(() => []),
      // Where the family lives, for the payees each kind of bill offers (11-010).
      loadHouseholdAddress(supabase, householdId).catch(() => null),
      // Amounts given ahead for coming months; paid months are the history above.
      listGivenPeriods(supabase, householdId).catch(() => new Map()),
    ]);

  // A stale mailbox and "no bills by email" must never look alike (17-003): if
  // a connected mailbox is not working, the screen says so before the totals.
  // The tone is the domain's decision; the words are the reader's (story 22-004).
  const mailHealth =
    integrations
      .filter((integration) => integration.kind === "email")
      .map((integration) => {
        const health = describeEmailHealth({
          status: integration.status,
          lastSuccessAt: integration.lastSuccessAt,
        });
        return { ...health, message: mailHealthWords(t, integration.status, integration.lastSuccessAt) ?? health.message };
      })
      .find((health) => health.tone !== "silent") ?? null;

  const history = (historyRows.data as HistoryRow[] | null) ?? [];
  // What each budget has used this period, from the payments on record, in
  // the budget's own currency only (story 22-007). A payment's kind is its
  // own when recorded, else its bill's.
  const kindOfBill = new Map(obligations.map((o) => [o.id, o.kind as string]));
  // And the line item it is (electricity, petrol…), what a budget is now set for (2026-10-20).
  const typeOfBill = new Map(obligations.map((o) => [o.id, o.billType ?? null]));
  const payments: BudgetPayment[] = history.flatMap((row) => {
    const kind = row.kind ?? kindOfBill.get(row.obligation_id);
    return kind ? [{ kind, billType: typeOfBill.get(row.obligation_id) ?? null, currency: row.currency, amountMinor: Number(row.amount_minor), paidOn: row.paid_on, periodLabel: row.period_label }] : [];
  });
  const today = isoDateIn(new Date(), timezone);
  const budgets = budgetRows.map((budget) => ({ ...budget, ...budgetSpend(budget, payments, today) }));
  const nameOf = (id: string | null) =>
    members.find((member) => member.id === id)?.displayName ?? null;
  const admin = isHouseholdAdmin(membership);
  const formLabels = billFormLabels(t);
  // "2 payments in USD, 1 payment in EUR" — counted, never converted (story 22-007).
  const paymentsIn = (counts: { currency: string; count: number }[]) =>
    counts.map(({ currency: other, count }) => t("bills.paymentsIn", { count, currency: other })).join(", ");
  // Totals are shown in the currency the household's bills are actually in;
  // the household's own currency only when nothing is on record yet. No
  // amount is ever converted (story 22-007).
  const householdCurrency = session.locale.preferences.currency;
  const currency =
    obligations.find((o) => o.currency)?.currency ??
    history[0]?.currency ??
    householdCurrency;

  const upcoming = obligations
    .filter((o) => o.status !== "paid" && o.status !== "cancelled")
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const settled = obligations.filter((o) => o.status === "paid");
  const needs = agenda ? [...agenda.bills, ...agenda.anomalies] : [];
  const trackedBills = obligations
    .filter((o) => o.status !== "cancelled")
    .map((o) => ({
      id: o.id,
      name: o.name,
      currency: o.currency,
      kind: o.kind,
      payee: o.payee,
      responsibleMemberId: o.responsibleMemberId,
    }));
  // What the transaction form offers: who can own a payment, and the payees
  // and written-in kinds this household has already used.
  const transactionChoices = {
    members: members
      .filter((member) => member.status === "active" && member.memberType !== "child")
      .map((member) => ({ id: member.id, displayName: member.displayName })),
    payeeOptions: distinct([
      ...obligations.map((o) => o.payee),
      ...history.map((row) => row.payee),
    ]),
    kindOptions: distinct(history.map((row) => row.kind)),
  };
  // The bill form's choices: each typical bill, and its payees nearest the
  // home first (11-010). Worked out here; the browser gets only the names.
  const home = homePlaceFrom(address?.formattedAddress ?? null, membership.locale?.household.region ?? null);
  const billChoices: BillChoices = {
    types: BILL_TYPES.map((type) => ({ key: type.key, kind: type.kind, recurrence: type.recurrence, payees: type.payees })),
    payees: Object.fromEntries([...new Set(BILL_TYPES.map((type) => type.payees))].map((category) => [category, payeesFor(category, home)])),
    householdPayees: transactionChoices.payeeOptions,
    members: transactionChoices.members,
    place: home.city ?? home.state,
  };
  const monthName = new Intl.DateTimeFormat(viewer.language, { month: "long", year: "numeric", timeZone: "UTC" });
  const periodLabels: BillPeriodLabels = {
    fill: t("bills.periods.fill", { month: "{month}" }),
    fillTitle: t("bills.periods.fillTitle", { name: "{name}", month: "{month}" }),
    fillDescription: t("bills.periods.fillDescription"),
    amount: formLabels.amount,
    paidOn: t("bills.periods.paidOn"),
    save: t("bills.periods.save"),
    saving: formLabels.saving,
    clear: t("bills.periods.clear"),
  };

  // Monthly spend from recorded history: a trend, not a ledger. Only the
  // amounts in the currency shown are added; any others are counted, never
  // converted or mixed in (story 22-007).
  // A month paid ahead (11-010) is not spending yet: the trend runs up to this month.
  const thisMonth = today.slice(0, 7);
  const trendRows = history.filter((row) => row.currency === currency && row.period_label <= thisMonth);
  const otherCurrencyCounts = new Map<string, number>();
  for (const row of history)
    if (row.currency !== currency) otherCurrencyCounts.set(row.currency, (otherCurrencyCounts.get(row.currency) ?? 0) + 1);
  const byPeriod = new Map<string, number>();
  for (const row of trendRows)
    byPeriod.set(
      row.period_label,
      (byPeriod.get(row.period_label) ?? 0) + Number(row.amount_minor),
    );
  const periods = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6);
  const thisPeriod = periods[periods.length - 1]?.[1] ?? 0;
  const lastPeriod = periods[periods.length - 2]?.[1] ?? null;
  const change = lastPeriod
    ? Math.round(((thisPeriod - lastPeriod) / lastPeriod) * 100)
    : null;
  // The same months as lines (the owner, 2026-10-20: "line graph for each type"):
  // six calendar months ending at the newest on record, so a month with nothing
  // shows as a gap, never a guess; the total first, then each bill.
  const lineMonths = (() => {
    const newest = periods[periods.length - 1]?.[0];
    if (!newest) return [] as string[];
    const [year, month] = newest.split("-").map(Number) as [number, number];
    return Array.from({ length: 6 }, (_, back) => {
      const date = new Date(Date.UTC(year, month - 1 - (5 - back), 1));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    });
  })();
  const spansYears = new Set(lineMonths.map((label) => label.slice(0, 4))).size > 1;
  const monthWords = lineMonths.map((label) =>
    new Intl.DateTimeFormat(viewer.language, { month: "short", ...(spansYears ? { year: "2-digit" } : {}), timeZone: "UTC" }).format(new Date(`${label}-15T00:00:00Z`)),
  );
  const niceTicks = (values: (number | null)[]) => {
    const peak = Math.max(0, ...values.map((value) => value ?? 0));
    if (peak === 0) return [{ value: 0, text: formatMoney(0, currency) }];
    const rough = peak / 2;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate * 2 >= peak) ?? 10 * magnitude;
    return [0, step, step * 2].map((value) => ({ value, text: formatMoney(value, currency) }));
  };
  const seriesOf = (key: string, name: string, rows: HistoryRow[]): SpendSeries => {
    const byMonth = new Map<string, number>();
    for (const row of rows) byMonth.set(row.period_label, (byMonth.get(row.period_label) ?? 0) + Number(row.amount_minor));
    const values = lineMonths.map((label) => byMonth.get(label) ?? null);
    return { key, name, values, texts: values.map((value) => (value === null ? null : formatMoney(value, currency))), ticks: niceTicks(values) };
  };
  const billName = new Map(obligations.map((o) => [o.id, o.name]));
  const inWindow = trendRows.filter((row) => lineMonths.includes(row.period_label));
  const billSeries = [...new Set(inWindow.map((row) => row.obligation_id))]
    .map((id) => seriesOf(id, billName.get(id) ?? inWindow.find((row) => row.obligation_id === id)?.payee ?? t("bills.spend.all"), inWindow.filter((row) => row.obligation_id === id)))
    .sort((a, b) => b.values.reduce<number>((sum, value) => sum + (value ?? 0), 0) - a.values.reduce<number>((sum, value) => sum + (value ?? 0), 0) || a.name.localeCompare(b.name));
  const spendSeries = [seriesOf("all", t("bills.spend.all"), inWindow), ...billSeries];

  // What each Overview count opens onto: the same real rows the sections
  // below already render (never a second, thinner list invented for the
  // card) — up to a handful, with the original section still there for
  // the rest.
  const metrics: ExpandableMetric[] = [
    {
      label: t("bills.metric.needYou"),
      value: needs.length,
      icon: <IconTile icon={Wallet} tone="attention" size="sm" />,
      details:
        needs.length === 0 ? (
          <MetricDetailEmpty>{t("bills.metric.needYou.empty")}</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <ul className="space-y-1">
              {needs.slice(0, 4).map((item) => (
                <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} href="/bills?tab=transactions" />
              ))}
            </ul>
            {needs.length > 4 ? (
              <PillLink href="/notifications" tone="quiet">
                {t("bills.viewAll", { count: needs.length })}
              </PillLink>
            ) : null}
          </div>
        ),
    },
    {
      label: t("bills.metric.upcoming"),
      value: upcoming.length,
      icon: <IconTile icon={CalendarDays} tone="money" size="sm" />,
      details:
        upcoming.length === 0 ? (
          <MetricDetailEmpty>{t("bills.metric.upcoming.empty")}</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <ul className="space-y-1">
              {upcoming.slice(0, 4).map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  owner={nameOf(bill.responsibleMemberId)}
                  timezone={timezone}
                  needsYou={needs.some((n) => n.action?.target === bill.id)}
                  history={history.filter((h) => h.obligation_id === bill.id)}
                  admin={admin}
                  householdId={householdId}
                  t={t}
                  labels={formLabels}
                  choices={billChoices}
                />
              ))}
            </ul>
            {upcoming.length > 4 ? (
              <PillLink href="/bills" tone="quiet">
                {t("bills.viewAll", { count: upcoming.length })}
              </PillLink>
            ) : null}
          </div>
        ),
    },
    {
      label: t("bills.metric.settled"),
      value: settled.length,
      icon: <IconTile icon={CircleCheck} tone="handled" size="sm" />,
      details:
        settled.length === 0 ? (
          <MetricDetailEmpty>{t("bills.metric.settled.empty")}</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <ul className="space-y-1">
              {settled.slice(0, 4).map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  owner={nameOf(bill.responsibleMemberId)}
                  timezone={timezone}
                  needsYou={false}
                  history={history.filter((h) => h.obligation_id === bill.id)}
                  admin={admin}
                  householdId={householdId}
                  t={t}
                  labels={formLabels}
                  choices={billChoices}
                />
              ))}
            </ul>
            {settled.length > 4 ? (
              <PillLink href="/bills?tab=transactions" tone="quiet">
                {t("bills.viewAll", { count: settled.length })}
              </PillLink>
            ) : null}
          </div>
        ),
    },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">
              {t("nav.item.bills")}
            </h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {t("bills.lede")}
            </p>
          </div>
          {admin ? (
            <div className="flex flex-wrap gap-2">
              {active === "transactions" ? (
                <AddTransactionButton
                  householdId={householdId}
                  bills={trackedBills}
                  defaultCurrency={householdCurrency}
                  labels={formLabels}
                  {...transactionChoices}
                />
              ) : (
                <AddBillButton householdId={householdId} defaultCurrency={householdCurrency} labels={formLabels} choices={billChoices} />
              )}
            </div>
          ) : null}
        </header>

        {mailHealth ? (
          <Card className="flex items-start gap-3 p-4">
            <Mail
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{mailHealth.message}</p>
              {mailHealth.tone === "needs_action" && admin ? (
                <div className="mt-2">
                  <PillLink href="/household/integrations" tone="primary">
                    {t("bills.mail.fix")}
                  </PillLink>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <SegmentedControl
          label={t("bills.view")}
          active={active}
          segments={[
            {
              key: "overview",
              label: t("bills.tab.overview"),
              href: "/bills",
              count: needs.length,
            },
            {
              key: "transactions",
              label: t("bills.tab.transactions"),
              href: "/bills?tab=transactions",
            },
          ]}
        />

        {active === "overview" ? (
          <>
            <ExpandableMetricRow metrics={metrics} />

            <section>
              <SectionHeader title={t("bills.upcoming")} count={upcoming.length} />
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  tone="money"
                  title={t("bills.upcoming.emptyTitle")}
                  description={t("bills.upcoming.emptyLede")}
                  action={<AddBillButton householdId={householdId} defaultCurrency={householdCurrency} labels={formLabels} choices={billChoices} />}
                />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {upcoming.slice(0, 8).map((bill) => (
                      <BillRow
                        key={bill.id}
                        bill={bill}
                        owner={nameOf(bill.responsibleMemberId)}
                        timezone={timezone}
                        needsYou={needs.some(
                          (n) => n.action?.target === bill.id,
                        )}
                        history={history.filter(
                          (h) => h.obligation_id === bill.id,
                        )}
                        admin={admin}
                        householdId={householdId}
                        t={t}
                        labels={formLabels}
                        choices={billChoices}
                        periods={billPeriods(
                          { dueOn: bill.dueOn, recurrence: bill.recurrence ?? null, status: bill.status, amountMinor: bill.amountMinor, currency: bill.currency },
                          history.filter((h) => h.obligation_id === bill.id).map((h) => ({ periodLabel: h.period_label, amountMinor: Number(h.amount_minor), currency: h.currency, paidOn: h.paid_on })),
                          givenPeriods.get(bill.id) ?? [],
                          undefined,
                          PERIODS_BEHIND,
                        )}
                        monthOf={(dueOn: string) => monthName.format(new Date(`${dueOn}T00:00:00Z`))}
                        periodLabels={periodLabels}
                        defaultCurrency={householdCurrency}
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </section>

            {agenda && agenda.anomalies.length > 0 ? (
              <section>
                <SectionHeader
                  title={t("bills.worthALook")}
                  count={agenda.anomalies.length}
                />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {agenda.anomalies.map((item) => (
                      <AgendaExpandableRow
                        key={item.subjectKey}
                        item={item}
                        timezone={timezone}
                        href="/bills?tab=transactions"
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}

            <section className="grid gap-4 sm:grid-cols-2">
              <Card className="sm:col-span-2">
                <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                  {t("bills.spend")}
                </p>
                {periods.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--wh-foreground-muted)]">
                    {t("bills.spend.empty")}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-2xl font-bold tracking-tight">
                      {formatMoney(thisPeriod, currency)}
                    </p>
                    <p className="text-xs text-[var(--wh-foreground-muted)]">
                      {periods[periods.length - 1]?.[0]}
                    </p>
                    {change !== null ? (
                      <p
                        className={`mt-1 flex items-center gap-1 text-xs font-medium ${change <= 0 ? "text-[var(--wh-handled)]" : "text-[var(--wh-attention)]"}`}
                      >
                        {change <= 0 ? (
                          <TrendingDown aria-hidden className="size-3.5" />
                        ) : (
                          <TrendingUp aria-hidden className="size-3.5" />
                        )}
                        {t("bills.spend.change", { percent: Math.abs(change) })}
                      </p>
                    ) : null}
                    <section className="mt-4" aria-label={t("bills.spend.chart", { count: lineMonths.length })}>
                      <SpendLines months={lineMonths} monthWords={monthWords} series={spendSeries} tableLabel={t("bills.spend.table")} monthHeading={t("bills.spend.month")} />
                    </section>
                  </>
                )}
                {otherCurrencyCounts.size > 0 ? (
                  <p className="mt-2 text-xs text-[var(--wh-foreground-subtle)]">
                    {t("bills.spend.otherCurrencies", {
                      currency,
                      list: paymentsIn(
                        [...otherCurrencyCounts.entries()]
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([other, count]) => ({ currency: other, count })),
                      ),
                    })}
                  </p>
                ) : null}
              </Card>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                    {t("bills.budgets")}
                  </p>
                  {admin ? <AddBudgetButton householdId={householdId} defaultCurrency={householdCurrency} labels={formLabels} /> : null}
                </div>
                {budgets.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--wh-foreground-muted)]">
                    {admin ? t("bills.budgets.emptyAdmin") : t("bills.budgets.emptyMember")}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {budgets.map((budget) => {
                      const v = budgetView({
                        category: budget.category,
                        limitMinor: budget.limitMinor,
                        currency: budget.currency,
                        spentMinor: budget.spentMinor,
                      });
                      const pct = Math.min(100, Math.round((budget.spentMinor / Math.max(1, budget.limitMinor)) * 100));
                      const used = t(`bills.budget.used.${budget.period}`, {
                        spent: formatMoney(budget.spentMinor, budget.currency),
                        limit: formatMoney(budget.limitMinor, budget.currency),
                      });
                      return (
                        <li key={budget.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{(BILL_TYPES as readonly { key: string }[]).some((type) => type.key === budget.category) ? t(`bills.type.${budget.category}` as TranslationKey) : billKindName(t, budget.category)}</p>
                              <p className="text-xs text-[var(--wh-foreground-muted)]">
                                {used} ·{" "}
                                {v.overBy
                                  ? t("bills.budget.overBy", { amount: formatMoney(v.overBy, budget.currency) })
                                  : t("bills.budget.left", { amount: formatMoney(v.remainingMinor, budget.currency) })}
                              </p>
                            </div>
                            {admin ? (
                              <BudgetRowControls
                                householdId={householdId}
                                budget={{ id: budget.id, category: budget.category, period: budget.period, limitMinor: budget.limitMinor, currency: budget.currency }}
                                labels={formLabels}
                              />
                            ) : null}
                          </div>
                          <div
                            className="mt-1.5 h-1.5 rounded-full bg-[var(--wh-surface-muted)]"
                            role="img"
                            aria-label={t("bills.budget.usedAria", { percent: pct })}
                          >
                            <div
                              className={`h-full rounded-full ${v.overBy ? "bg-[var(--wh-attention)]" : "bg-[var(--wh-primary)]"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {budget.otherCurrencies.length > 0 ? (
                            <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">
                              {t("bills.budget.notCounted", { list: paymentsIn(budget.otherCurrencies) })}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </section>

            <Card className="flex items-start gap-3 bg-[var(--wh-primary-soft)]/50 p-4">
              <ShieldCheck
                aria-hidden
                className="mt-0.5 size-5 shrink-0 text-[var(--wh-primary)]"
              />
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {t("bills.payNote")}
              </p>
            </Card>
          </>
        ) : null}

        {active === "transactions" ? (
          history.length === 0 && settled.length === 0 ? (
            <EmptyState
              icon={Receipt}
              tone="money"
              title={t("bills.transactions.emptyTitle")}
              description={t("bills.transactions.emptyLede")}
            />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {history.slice(0, 40).map((row) => {
                  const bill = obligations.find(
                    (o) => o.id === row.obligation_id,
                  );
                  return (
                    <TransactionRow
                      key={`${row.obligation_id}-${row.period_label}`}
                      row={row}
                      bill={bill}
                      owner={nameOf(row.owner_member_id ?? bill?.responsibleMemberId ?? null)}
                      choices={transactionChoices}
                      admin={admin}
                      householdId={householdId}
                      timezone={timezone}
                      t={t}
                      labels={formLabels}
                    />
                  );
                })}
              </ul>
            </Card>
          )
        ) : null}

        <QuoteCard>{t("bills.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function BillRow({
  bill,
  owner,
  timezone,
  needsYou,
  history,
  admin,
  householdId,
  t,
  labels,
  choices,
  periods,
  monthOf,
  periodLabels,
  defaultCurrency,
}: {
  bill: Obligation;
  owner: string | null;
  timezone: string;
  needsYou: boolean;
  history: HistoryRow[];
  admin: boolean;
  householdId: string;
  t: Translate;
  labels: BillFormLabels;
  choices: BillChoices;
  /** This month and the coming ones, made ahead (11-010); only the Upcoming list shows them. */
  periods?: BillPeriod[];
  monthOf?: (dueOn: string) => string;
  periodLabels?: BillPeriodLabels;
  defaultCurrency?: string;
}) {
  const amount =
    bill.amountMinor !== null && bill.currency
      ? formatMoney(bill.amountMinor, bill.currency)
      : t("bills.amountNotIn");
  const due = bill.dueOn
    ? t("bills.due", { date: formatDate(timezone, new Date(bill.dueOn), "long") })
    : t("bills.noDueDate");
  const kindLabel = billKindName(t, bill.kind);
  const action =
    bill.status === "scheduled" ? (
      <Badge tone="handled">{t("bills.arranged")}</Badge>
    ) : needsYou ? (
      <PillLink
        href={`/ai?q=${encodeURIComponent(`Pay the ${bill.name.toLowerCase()}.`)}`}
        tone="primary"
      >
        {t("bills.pay")}
      </PillLink>
    ) : (
      <PillLink href="/bills?tab=transactions" tone="quiet">
        {t("bills.open")}
      </PillLink>
    );

  return (
    <ExpandableRow
      summary={
        <>
          <IconTile icon={Wallet} tone="money" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{bill.name}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
              {due} · {amount}
              {owner ? ` · ${owner}` : ""}
            </span>
          </span>
          <span className="shrink-0">{action}</span>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Fact label={t("bills.fact.kind")} value={kindLabel} />
          <Fact label={t("bills.fact.status")} value={statusWord(t, bill.status)} />
          <Fact label={t("bills.fact.payee")} value={bill.payee} />
          <Fact label={t("bills.fact.owner")} value={owner} />
          <Fact
            label={t("bills.fact.due")}
            value={
              bill.dueOn
                ? formatDate(timezone, new Date(bill.dueOn), "long")
                : null
            }
          />
          <Fact
            label={t("bills.fact.amount")}
            value={
              bill.amountMinor !== null && bill.currency
                ? formatMoney(bill.amountMinor, bill.currency)
                : null
            }
          />
        </dl>
        {periods && periods.length > 0 && monthOf && periodLabels ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
              {t("bills.periods.title")}
            </p>
            <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3">
              {periods.map((period) => {
                const month = monthOf(period.dueOn);
                const money = (minor: number) => formatMoney(minor, period.currency ?? bill.currency ?? defaultCurrency ?? "INR");
                const line =
                  period.state === "paid"
                    ? period.paidOn
                      ? t("bills.periods.paid", { date: formatDate(timezone, new Date(period.paidOn), "long") })
                      : t("bills.periods.paidNoDate")
                    : period.state === "earlier"
                      ? t("bills.periods.wasDue", { date: formatDate(timezone, new Date(period.dueOn), "long") })
                      : t("bills.periods.due", { date: formatDate(timezone, new Date(period.dueOn), "long") });
                const amountWords =
                  period.amountMinor !== null
                    ? money(period.amountMinor)
                    : period.state === "earlier"
                      ? t("bills.periods.notEntered")
                      : period.usualMinor !== null
                        ? t("bills.periods.usually", { amount: money(period.usualMinor) })
                        : t("bills.periods.notIn");
                return (
                  <li key={period.periodLabel} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{month}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{line}</span>
                    </span>
                    <span className={`shrink-0 text-right text-sm ${period.amountMinor !== null ? "font-medium" : period.state === "earlier" ? "font-medium text-[var(--wh-attention)]" : "text-[var(--wh-foreground-muted)]"}`}>{amountWords}</span>
                    {period.state === "paid" ? (
                      <CircleCheck aria-hidden className="size-4 shrink-0 text-[var(--wh-handled)]" />
                    ) : admin ? (
                      <BillPeriodButton
                        householdId={householdId}
                        obligationId={bill.id}
                        billName={bill.name}
                        periodLabel={period.periodLabel}
                        month={month}
                        amountMinor={period.amountMinor}
                        suggestedMinor={period.usualMinor}
                        currency={period.currency ?? bill.currency ?? defaultCurrency ?? "INR"}
                        given={period.amountFrom === "given"}
                        labels={periodLabels}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {history.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
              {t("bills.recordedPeriods")}
            </p>
            <ul className="space-y-1">
              {history
                .sort((a, b) => b.period_label.localeCompare(a.period_label))
                .slice(0, 6)
                .map((row) => (
                  <li
                    key={row.period_label}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-[var(--wh-foreground-muted)]">
                      {row.period_label}
                    </span>
                    <span className="font-medium">
                      {formatMoney(Number(row.amount_minor), row.currency)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {admin ? (
          <ObligationRowControls
            householdId={householdId}
            bill={{
              id: bill.id,
              name: bill.name,
              kind: bill.kind,
              payee: bill.payee,
              amountMinor: bill.amountMinor,
              currency: bill.currency,
              dueOn: bill.dueOn,
              billType: bill.billType ?? null,
              recurrence: bill.recurrence ?? null,
              responsibleMemberId: bill.responsibleMemberId,
            }}
            labels={labels}
            choices={choices}
          />
        ) : null}
      </div>
    </ExpandableRow>
  );
}

function TransactionRow({
  row,
  bill,
  owner,
  choices,
  admin,
  householdId,
  timezone,
  t,
  labels,
}: {
  row: HistoryRow;
  bill: Obligation | undefined;
  owner: string | null;
  choices: { members: { id: string; displayName: string }[]; payeeOptions: string[]; kindOptions: string[] };
  admin: boolean;
  householdId: string;
  timezone: string;
  t: Translate;
  labels: BillFormLabels;
}) {
  const amount = formatMoney(Number(row.amount_minor), row.currency);
  // A transaction's own payee and kind when it says (the household's own
  // words, shown as saved), otherwise its bill's kind in the reader's words.
  const payee = row.payee ?? bill?.payee ?? null;
  const kind = row.kind ?? (bill?.kind ? billKindName(t, bill.kind) : null);
  const transaction = {
    obligationId: row.obligation_id,
    periodLabel: row.period_label,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    paidOn: row.paid_on,
    payee: row.payee,
    kind: row.kind,
    ownerMemberId: row.owner_member_id,
  };

  return (
    <ExpandableRow
      summary={
        <>
          <IconTile icon={Receipt} tone="money" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{bill?.name ?? t("bills.bill")}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
              {row.period_label}
              {payee ? ` · ${payee}` : ""}
            </span>
          </span>
          <span className="shrink-0">
            <Badge>{amount}</Badge>
          </span>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Fact label={t("bills.fact.period")} value={row.period_label} />
          <Fact label={t("bills.fact.amount")} value={amount} />
          <Fact label={t("bills.fact.kind")} value={kind} />
          <Fact label={t("bills.fact.payee")} value={payee} />
          <Fact label={t("bills.fact.owner")} value={owner} />
          <Fact label={t("bills.fact.paidOn")} value={row.paid_on ? formatDate(timezone, new Date(`${row.paid_on}T00:00:00.000Z`), "long") : null} />
        </dl>
        {admin && bill ? (
          <div className="flex flex-wrap gap-2">
            <EditTransactionControl
              householdId={householdId}
              bill={{
                id: bill.id,
                name: bill.name,
                currency: bill.currency,
                kind: bill.kind,
                payee: bill.payee,
                responsibleMemberId: bill.responsibleMemberId,
              }}
              transaction={transaction}
              labels={labels}
              {...choices}
            />
            <RemoveTransactionControl
              householdId={householdId}
              transaction={transaction}
              label={bill.name}
              labels={labels}
            />
          </div>
        ) : null}
      </div>
    </ExpandableRow>
  );
}

/** A bill's status as a word in the reader's language; the stored value never changes. */
function statusWord(t: Translate, status: Obligation["status"]): string {
  return t(`bills.status.${status}`);
}

/**
 * What a mailbox that is not working says, in the reader's words — the same
 * cases, and the same hours, as the domain's own English (`describeEmailHealth`).
 * An unknown status keeps the domain's English.
 */
function mailHealthWords(t: Translate, status: string, lastSuccessAt: Date | null, now = new Date()): string | null {
  switch (status) {
    case "degraded": {
      if (!lastSuccessAt) return t("bills.mail.trouble");
      const hours = Math.floor((now.getTime() - lastSuccessAt.getTime()) / 3_600_000);
      return t("bills.mail.lastWorked", { count: hours });
    }
    case "error":
      return t("bills.mail.error");
    case "revoked":
      return t("bills.mail.revoked");
    default:
      return null;
  }
}

/** Each non-empty value once, in a stable order, for a picker's options. */
function distinct(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())))).sort((a, b) => a.localeCompare(b));
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
        {label}
      </dt>
      <dd className="text-sm capitalize">{value}</dd>
    </div>
  );
}
