import { Lightbulb, PackageCheck, ShoppingBasket, Sparkles, Truck } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { expectedDepletion } from "@wonderhome/core/commerce/consumables";
import { listConsumables, listOrders, listPurchases, shoppingAgenda } from "@wonderhome/core/commerce/repository";
import { format as formatMoney } from "@wonderhome/core/finance/payments";
import { totalsByCurrency } from "@wonderhome/core/finance/totals";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaExpandableRow } from "../_components/agenda-expandable-row";
import { AddConsumableButton, ConsumableRowControls } from "../_components/commerce-forms";
import { groceryFormLabels } from "../_lib/grocery-form-labels";
import { formatDate, requireSession } from "../_lib/session";

export const metadata = { title: "Groceries" };
export const dynamic = "force-dynamic";

type SuggestionRow = {
  id: string;
  quantity: number;
  reason: string;
  evidence_basis: "purchase_history" | "configured_inventory" | "member_stated";
  needed_by: string | null;
  estimated_cost_minor: number | null;
  currency: string | null;
  status: string;
  consumables: { name: string; unit: string } | { name: string; unit: string }[] | null;
};

/**
 * Groceries (requirements §18): Overview, List and Orders.
 *
 * The suggested order is built from what the household actually runs out of,
 * each line carrying its reason and its evidence. "Review order" shows quantity
 * and the estimated total before anything is placed — and nothing is placed
 * here: no commerce provider is live.
 */
export default async function GroceriesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/groceries")]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();

  const entitlement = await may(supabase, householdId, "commerce.orders");
  const active = tab === "list" || tab === "orders" ? tab : "overview";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/groceries", back: { href: "/more", label: t("common.back") }, title: t("nav.item.groceries") };

  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShoppingBasket} tone="care" title={t("groceries.notInPlan")} description={entitlement.reason} />
      </AppShell>
    );
  }

  const [agenda, consumables, orders, suggestionRows, purchases] = await Promise.all([
    shoppingAgenda(supabase, householdId).catch(() => null),
    listConsumables(supabase, householdId).catch(() => []),
    listOrders(supabase, householdId).catch(() => []),
    supabase
      .from("cart_suggestions")
      .select("id, quantity, reason, evidence_basis, needed_by, estimated_cost_minor, currency, status, consumables(name, unit)")
      .eq("household_id", householdId)
      .in("status", ["suggested", "accepted"])
      .order("needed_by", { ascending: true, nullsFirst: false }),
    listPurchases(supabase, householdId, { limit: 300 }).catch(() => []),
  ]);
  // What was actually bought, per item — the history a receipt adds to (09-009).
  const purchasesByItem = new Map<string, typeof purchases>();
  for (const purchase of purchases) purchasesByItem.set(purchase.consumableId, [...(purchasesByItem.get(purchase.consumableId) ?? []), purchase]);
  // A purchase date is a calendar day, not an instant: read it as one, wherever the household is.
  const day = (isoDay: string) => formatDate("UTC", new Date(`${isoDay}T00:00:00Z`), "long");

  const suggestions = ((suggestionRows.data as SuggestionRow[] | null) ?? []).map((row) => {
    const embedded = Array.isArray(row.consumables) ? row.consumables[0] : row.consumables;
    return { ...row, name: embedded?.name ?? t("groceries.item"), unit: embedded?.unit ?? "" };
  });
  // One estimate per currency, never one number mixing them (story 22-007).
  const estimates = totalsByCurrency(suggestions.map((row) => ({ minor: row.estimated_cost_minor, currency: row.currency })));
  const priced = estimates.reduce((sum, estimate) => sum + estimate.count, 0);
  const estimateText = estimates.map((estimate) => formatMoney(estimate.minor, estimate.currency)).join(" + ");
  const needs = agenda ? [...agenda.needed, ...agenda.lateOrders] : [];
  const existingNames = Array.from(new Set(consumables.map((item) => item.name))).sort((a, b) => a.localeCompare(b));
  const existingCategories = Array.from(new Set(consumables.map((item) => item.category))).sort((a, b) => a.localeCompare(b));
  const formLabels = groceryFormLabels(t);
  // Where a line's evidence came from, in the reader's words (the domain's own `describeBasis` is the English record).
  const basis = (value: SuggestionRow["evidence_basis"]) => t(`groceries.basis.${value}`);
  const suggestionSummary = [
    t("groceries.suggested.items", { count: suggestions.length }),
    priced > 0 ? `${t("groceries.suggested.estimate", { amount: estimateText })}${priced < suggestions.length ? ` ${t("groceries.suggested.partlyPriced")}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.groceries")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("groceries.lede")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddConsumableButton householdId={householdId} existingNames={existingNames} existingCategories={existingCategories} labels={formLabels} />
          </div>
        </header>

        <SegmentedControl
          label={t("groceries.view")}
          active={active}
          segments={[
            { key: "overview", label: t("groceries.tab.overview"), href: "/groceries", count: needs.length },
            { key: "list", label: t("groceries.tab.list"), href: "/groceries?tab=list", count: suggestions.length },
            { key: "orders", label: t("groceries.tab.orders"), href: "/groceries?tab=orders" },
          ]}
        />

        {active === "overview" ? (
          <>
            <section>
              <SectionHeader title={t("groceries.suggested")} count={suggestions.length} />
              {suggestions.length === 0 ? (
                <EmptyState icon={ShoppingBasket} tone="care" title={t("groceries.suggested.emptyTitle")} description={t("groceries.suggested.emptyLede")} action={<AddConsumableButton householdId={householdId} labels={formLabels} />} />
              ) : (
                <Card className="space-y-3">
                  <ul className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">
                    {suggestions.slice(0, 6).map((row) => (
                      <li key={row.id} className="flex w-24 shrink-0 flex-col items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-2 py-3 text-center">
                        <span className="grid size-10 place-items-center rounded-full bg-[var(--wh-tone-care-soft)] text-[var(--wh-tone-care)]"><ShoppingBasket className="size-5" /></span>
                        <span className="mt-2 w-full truncate text-xs font-semibold">{row.name}</span>
                        <span className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{row.quantity} {row.unit}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[var(--wh-foreground-muted)]">{suggestionSummary}</p>
                    <PillLink href="/groceries?tab=list" tone="primary">{t("groceries.reviewOrder")}</PillLink>
                  </div>
                </Card>
              )}
            </section>

            <section>
              <SectionHeader title={t("groceries.insights")} />
              {needs.length === 0 ? (
                <Card className="flex items-center gap-3 p-4">
                  <Sparkles aria-hidden className="size-5 shrink-0 text-[var(--wh-primary)]" />
                  <p className="text-sm text-[var(--wh-foreground-muted)]">
                    {agenda && agenda.checked > 0 ? t("groceries.insights.watched", { count: agenda.checked }) : t("groceries.insights.learning")}
                  </p>
                </Card>
              ) : (
                <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{needs.map((item) => <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} href="/groceries?tab=list" />)}</ul></Card>
              )}
            </section>
          </>
        ) : null}

        {active === "list" ? (
          <>
            <MetricGrid metrics={[{ label: t("groceries.metric.items"), value: suggestions.length, icon: ShoppingBasket, tone: "care" }, { label: t("groceries.metric.estimated"), value: priced > 0 ? estimateText : "—", icon: Lightbulb, tone: "money" }, { label: t("groceries.metric.tracked"), value: consumables.length, icon: PackageCheck, tone: "handled" }]} />
            {suggestions.length === 0 ? (
              <EmptyState icon={ShoppingBasket} tone="care" title={t("groceries.list.emptyTitle")} description={t("groceries.list.emptyLede")} />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {suggestions.map((row) => (
                    <ExpandableRow
                      key={row.id}
                      summary={
                        <>
                          <IconTile icon={ShoppingBasket} tone="care" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{row.name} · {row.quantity} {row.unit}</span>
                            <span className="block truncate text-xs text-[var(--wh-foreground-subtle)]">{row.reason}</span>
                          </span>
                          <span className="shrink-0">
                            {row.estimated_cost_minor !== null && row.currency ? <Badge>{formatMoney(row.estimated_cost_minor, row.currency)}</Badge> : <Badge tone="neutral">{t("groceries.unpriced")}</Badge>}
                          </span>
                        </>
                      }
                    >
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                        <div>
                          <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.why")}</dt>
                          <dd>{row.reason}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.basedOn")}</dt>
                          <dd>{basis(row.evidence_basis)}</dd>
                        </div>
                        {row.needed_by ? (
                          <div>
                            <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.neededBy")}</dt>
                            <dd>{formatDate(timezone, new Date(row.needed_by), "long")}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.estimatedCost")}</dt>
                          <dd>{row.estimated_cost_minor !== null && row.currency ? formatMoney(row.estimated_cost_minor, row.currency) : t("groceries.fact.notPriced")}</dd>
                        </div>
                      </dl>
                    </ExpandableRow>
                  ))}
                </ul>
              </Card>
            )}
            <Card className="flex items-start gap-3 bg-[var(--wh-attention-soft)]/50 p-4">
              <Truck aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-attention)]" />
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {t("groceries.noProvider")}
              </p>
            </Card>
            <section>
              <SectionHeader title={t("groceries.tracks")} count={consumables.length} />
              {consumables.length === 0 ? null : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {consumables.slice(0, 20).map((item) => {
                      const runsOut = expectedDepletion(item, now);
                      return (
                        <ExpandableRow
                          key={item.id}
                          summary={
                            <>
                              <IconTile icon={PackageCheck} tone="care" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{item.name}</span>
                                <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                                  {runsOut ? t("groceries.runsOut", { date: formatDate(timezone, runsOut, "long") }) : t("groceries.notEnoughHistory")}
                                </span>
                              </span>
                            </>
                          }
                        >
                          <div className="space-y-3">
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                              <div>
                                <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.category")}</dt>
                                <dd>{item.category}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.usualAmount")}</dt>
                                <dd>{item.typicalQuantity} {item.unit}</dd>
                              </div>
                              {item.daysPerUnit ? (
                                <div>
                                  <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.lastsAbout")}</dt>
                                  <dd>{t("groceries.fact.days", { count: item.daysPerUnit })}</dd>
                                </div>
                              ) : null}
                              {item.evidenceBasis ? (
                                <div>
                                  <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.basedOn")}</dt>
                                  <dd>{basis(item.evidenceBasis)}</dd>
                                </div>
                              ) : null}
                              {item.lastPurchasedOn ? (
                                <div>
                                  <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.lastPurchased")}</dt>
                                  <dd>
                                    {day(item.lastPurchasedOn)}
                                    {item.lastPurchasedQuantity ? ` · ${item.lastPurchasedQuantity} ${item.unit}` : ""}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                            {purchasesByItem.get(item.id)?.length ? (
                              <div className="space-y-1.5">
                                <p className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("groceries.fact.recentPurchases")}</p>
                                <ul className="space-y-1 text-sm">
                                  {purchasesByItem.get(item.id)!.slice(0, 5).map((purchase) => (
                                    <li key={purchase.id} className="break-words">
                                      {[
                                        day(purchase.purchasedOn),
                                        `${purchase.quantity} ${item.unit}`,
                                        purchase.merchant,
                                        purchase.unitCostMinor !== null && purchase.currency ? t("groceries.purchase.each", { amount: formatMoney(purchase.unitCostMinor, purchase.currency) }) : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            <ConsumableRowControls
                              householdId={householdId}
                              item={{
                                id: item.id,
                                name: item.name,
                                category: item.category,
                                unit: item.unit,
                                typicalQuantity: item.typicalQuantity,
                                daysPerUnit: item.daysPerUnit,
                              }}
                              existingNames={existingNames}
                              existingCategories={existingCategories}
                              labels={formLabels}
                            />
                          </div>
                        </ExpandableRow>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </section>
          </>
        ) : null}

        {active === "orders" ? (
          orders.length === 0 ? (
            <EmptyState icon={Truck} tone="care" title={t("groceries.orders.emptyTitle")} description={t("groceries.orders.emptyLede")} />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {orders.map((order) => (
                  <ActionRow
                    key={order.id}
                    icon={Truck}
                    tone="care"
                    title={t("groceries.order.from", { provider: order.provider })}
                    meta={`${formatMoney(order.totalMinor, order.currency)}${order.expectedAt ? ` · ${t("groceries.order.expected", { date: formatDate(timezone, order.expectedAt, "long") })}` : ""}`}
                    action={<Badge tone={order.status === "delivered" ? "handled" : order.status === "failed" || order.status === "cancelled" ? "risk" : "attention"}>{t(`groceries.orderStatus.${order.status}`)}</Badge>}
                  />
                ))}
              </ul>
            </Card>
          )
        ) : null}

        <QuoteCard>{t("groceries.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
