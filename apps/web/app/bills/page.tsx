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
import { describeEmailHealth } from "@wonderhome/core/finance/email-connector";
import {
  budgetView,
  format as formatMoney,
  type Obligation,
} from "@wonderhome/core/finance/payments";
import {
  financeAgenda,
  listObligations,
} from "@wonderhome/core/finance/repository";
import {
  isHouseholdAdmin,
  listMembers,
} from "@wonderhome/core/identity/households";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaExpandableRow } from "../_components/agenda-expandable-row";
import {
  AddBillButton,
  AddTransactionButton,
  ObligationRowControls,
  RemoveTransactionControl,
} from "../_components/finance-forms";
import { formatDate, requireSession } from "../_lib/session";

export const metadata = { title: "Bills & Finance" };
export const dynamic = "force-dynamic";

type HistoryRow = {
  obligation_id: string;
  period_label: string;
  amount_minor: number;
  currency: string;
};
type BudgetRow = {
  id: string;
  category: string;
  limit_minor: number;
  currency: string;
  spent_minor: number;
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
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/bills",
    back: { href: "/more", label: "Back" },
    title: "Bills & Finance",
  };

  if (!view.permissions.includes("finance.view")) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={ShieldCheck}
          title="Not available to you"
          description="The household's money is visible to adults and administrators only."
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
          title="Bills are not part of this plan"
          description={entitlement.reason}
        />
      </AppShell>
    );
  }

  const active = tab === "transactions" ? "transactions" : "overview";
  const [agenda, obligations, members, historyRows, budgetRows, integrations] =
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
        .select("obligation_id, period_label, amount_minor, currency")
        .eq("household_id", householdId)
        .order("period_label", { ascending: false })
        .limit(120),
      supabase
        .from("budgets")
        .select("id, category, limit_minor, currency, spent_minor")
        .eq("household_id", householdId),
      listIntegrations(supabase, householdId).catch(() => []),
    ]);

  // A stale mailbox and "no bills by email" must never look alike (17-003): if
  // a connected mailbox is not working, the screen says so before the totals.
  const mailHealth =
    integrations
      .filter((integration) => integration.kind === "email")
      .map((integration) =>
        describeEmailHealth({
          status: integration.status,
          lastSuccessAt: integration.lastSuccessAt,
        }),
      )
      .find((health) => health.tone !== "silent") ?? null;

  const history = (historyRows.data as HistoryRow[] | null) ?? [];
  const budgets = (budgetRows.data as BudgetRow[] | null) ?? [];
  const nameOf = (id: string | null) =>
    members.find((member) => member.id === id)?.displayName ?? null;
  const admin = isHouseholdAdmin(membership);
  const currency =
    obligations.find((o) => o.currency)?.currency ??
    history[0]?.currency ??
    "INR";

  const upcoming = obligations
    .filter((o) => o.status !== "paid" && o.status !== "cancelled")
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const settled = obligations.filter((o) => o.status === "paid");
  const needs = agenda ? [...agenda.bills, ...agenda.anomalies] : [];
  const trackedBills = obligations
    .filter((o) => o.status !== "cancelled")
    .map((o) => ({ id: o.id, name: o.name, currency: o.currency }));

  // Monthly spend from recorded history: a trend, not a ledger.
  const byPeriod = new Map<string, number>();
  for (const row of history)
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
  const max = Math.max(1, ...periods.map(([, value]) => value));

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">
              Bills &amp; Finance
            </h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              Stay on top. Stress less.
            </p>
          </div>
          {admin ? (
            <div className="flex flex-wrap gap-2">
              {active === "transactions" ? (
                <AddTransactionButton
                  householdId={householdId}
                  bills={trackedBills}
                />
              ) : (
                <AddBillButton householdId={householdId} />
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
                    Fix the connection
                  </PillLink>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <SegmentedControl
          label="Finance view"
          active={active}
          segments={[
            {
              key: "overview",
              label: "Overview",
              href: "/bills",
              count: needs.length,
            },
            {
              key: "transactions",
              label: "Transactions",
              href: "/bills?tab=transactions",
            },
          ]}
        />

        {active === "overview" ? (
          <>
            <MetricGrid
              metrics={[
                {
                  label: "Need you",
                  value: needs.length,
                  icon: Wallet,
                  tone: "attention",
                },
                {
                  label: "Upcoming",
                  value: upcoming.length,
                  icon: CalendarDays,
                  tone: "money",
                },
                {
                  label: "Settled",
                  value: settled.length,
                  icon: CircleCheck,
                  tone: "handled",
                },
              ]}
            />

            <section>
              <SectionHeader title="Upcoming bills" count={upcoming.length} />
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  tone="money"
                  title="Nothing due"
                  description="Add the bills the household pays — electricity, internet, school fees — and WonderHome raises each one with the right amount of notice."
                  action={<AddBillButton householdId={householdId} />}
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
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </section>

            {agenda && agenda.anomalies.length > 0 ? (
              <section>
                <SectionHeader
                  title="Worth a look"
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
              <Card>
                <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                  Monthly spend
                </p>
                {periods.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--wh-foreground-muted)]">
                    A trend appears once a couple of months of bills are
                    recorded.
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
                        {Math.abs(change)}% vs last period
                      </p>
                    ) : null}
                    <div
                      className="mt-3 flex h-16 items-end gap-1.5"
                      role="img"
                      aria-label={`Spend over the last ${periods.length} periods`}
                    >
                      {periods.map(([label, value]) => (
                        <span
                          key={label}
                          title={`${label}: ${formatMoney(value, currency)}`}
                          className="flex-1 rounded-t-md bg-[var(--wh-tone-money)]/70"
                          style={{
                            height: `${Math.max(8, (value / max) * 100)}%`,
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </Card>
              <Card>
                <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                  Budgets
                </p>
                {budgets.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--wh-foreground-muted)]">
                    Set a budget per category to see what is left. A budget
                    never blocks a bill — the rent is due regardless.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2.5">
                    {budgets.map((budget) => {
                      const v = budgetView({
                        category: budget.category,
                        limitMinor: Number(budget.limit_minor),
                        currency: budget.currency,
                        spentMinor: Number(budget.spent_minor),
                      });
                      const pct = Math.min(
                        100,
                        Math.round(
                          (Number(budget.spent_minor) /
                            Math.max(1, Number(budget.limit_minor))) *
                            100,
                        ),
                      );
                      return (
                        <li key={budget.id}>
                          <div className="flex justify-between text-xs">
                            <span className="font-medium capitalize">
                              {budget.category}
                            </span>
                            <span className="text-[var(--wh-foreground-muted)]">
                              {v.overBy
                                ? `over by ${formatMoney(v.overBy, budget.currency)}`
                                : `${formatMoney(v.remainingMinor, budget.currency)} left`}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-[var(--wh-surface-muted)]">
                            <div
                              className={`h-full rounded-full ${v.overBy ? "bg-[var(--wh-attention)]" : "bg-[var(--wh-primary)]"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
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
                Every payment needs your approval and a fresh confirmation. No
                payment provider is connected yet, so &ldquo;Pay&rdquo; prepares
                the payment for approval and never moves money.
              </p>
            </Card>
          </>
        ) : null}

        {active === "transactions" ? (
          history.length === 0 && settled.length === 0 ? (
            <EmptyState
              icon={Receipt}
              tone="money"
              title="No transactions yet"
              description="Paid bills and recorded amounts appear here, period by period."
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
                      owner={bill ? nameOf(bill.responsibleMemberId) : null}
                      admin={admin}
                      householdId={householdId}
                    />
                  );
                })}
              </ul>
            </Card>
          )
        ) : null}

        <QuoteCard>On top of it, without thinking about it.</QuoteCard>
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
}: {
  bill: Obligation;
  owner: string | null;
  timezone: string;
  needsYou: boolean;
  history: HistoryRow[];
  admin: boolean;
  householdId: string;
}) {
  const amount =
    bill.amountMinor !== null && bill.currency
      ? formatMoney(bill.amountMinor, bill.currency)
      : "amount not in yet";
  const due = bill.dueOn
    ? `due ${formatDate(timezone, new Date(bill.dueOn), "long")}`
    : "no due date";
  const kindLabel = bill.kind.replace(/_/g, " ");
  const action =
    bill.status === "scheduled" ? (
      <Badge tone="handled">arranged</Badge>
    ) : needsYou ? (
      <PillLink
        href={`/ai?q=${encodeURIComponent(`Pay the ${bill.name.toLowerCase()}.`)}`}
        tone="primary"
      >
        Pay
      </PillLink>
    ) : (
      <PillLink href="/bills?tab=transactions" tone="quiet">
        View
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
          <Fact label="Kind" value={kindLabel} />
          <Fact label="Status" value={bill.status.replace(/_/g, " ")} />
          <Fact label="Payee" value={bill.payee} />
          <Fact label="Owner" value={owner} />
          <Fact
            label="Due"
            value={
              bill.dueOn
                ? formatDate(timezone, new Date(bill.dueOn), "long")
                : null
            }
          />
          <Fact
            label="Amount"
            value={
              bill.amountMinor !== null && bill.currency
                ? formatMoney(bill.amountMinor, bill.currency)
                : null
            }
          />
        </dl>
        {history.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
              Recorded periods
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
            }}
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
  admin,
  householdId,
}: {
  row: HistoryRow;
  bill: Obligation | undefined;
  owner: string | null;
  admin: boolean;
  householdId: string;
}) {
  const amount = formatMoney(Number(row.amount_minor), row.currency);

  return (
    <ExpandableRow
      summary={
        <>
          <IconTile icon={Receipt} tone="money" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{bill?.name ?? "Bill"}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
              {row.period_label}
              {bill?.payee ? ` · ${bill.payee}` : ""}
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
          <Fact label="Period" value={row.period_label} />
          <Fact label="Amount" value={amount} />
          <Fact label="Kind" value={bill?.kind ? bill.kind.replace(/_/g, " ") : null} />
          <Fact label="Payee" value={bill?.payee ?? null} />
          <Fact label="Owner" value={owner} />
        </dl>
        {admin && bill ? (
          <RemoveTransactionControl
            householdId={householdId}
            transaction={{
              obligationId: row.obligation_id,
              periodLabel: row.period_label,
              amountMinor: Number(row.amount_minor),
              currency: row.currency,
            }}
            label={bill.name}
          />
        ) : null}
      </div>
    </ExpandableRow>
  );
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
