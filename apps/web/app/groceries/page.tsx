import { Lightbulb, PackageCheck, ShoppingBasket, Sparkles, Truck } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { describeBasis, expectedDepletion } from "@wonderhome/core/commerce/consumables";
import { listConsumables, listOrders, shoppingAgenda } from "@wonderhome/core/commerce/repository";
import { format as formatMoney } from "@wonderhome/core/finance/payments";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaRow } from "../_components/agenda-row";
import { AddConsumableButton, ConsumableRowControls } from "../_components/commerce-forms";
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
  const { supabase, membership, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();

  const entitlement = await may(supabase, householdId, "commerce.orders");
  const active = tab === "list" || tab === "orders" ? tab : "overview";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/groceries", back: { href: "/more", label: "Back" }, title: "Groceries" };

  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShoppingBasket} tone="care" title="Groceries are not part of this plan" description={entitlement.reason} />
      </AppShell>
    );
  }

  const [agenda, consumables, orders, suggestionRows] = await Promise.all([
    shoppingAgenda(supabase, householdId).catch(() => null),
    listConsumables(supabase, householdId).catch(() => []),
    listOrders(supabase, householdId).catch(() => []),
    supabase
      .from("cart_suggestions")
      .select("id, quantity, reason, evidence_basis, needed_by, estimated_cost_minor, currency, status, consumables(name, unit)")
      .eq("household_id", householdId)
      .in("status", ["suggested", "accepted"])
      .order("needed_by", { ascending: true, nullsFirst: false }),
  ]);

  const suggestions = ((suggestionRows.data as SuggestionRow[] | null) ?? []).map((row) => {
    const embedded = Array.isArray(row.consumables) ? row.consumables[0] : row.consumables;
    return { ...row, name: embedded?.name ?? "Item", unit: embedded?.unit ?? "" };
  });
  const currency = suggestions.find((row) => row.currency)?.currency ?? "INR";
  const total = suggestions.reduce((sum, row) => sum + (row.estimated_cost_minor ?? 0), 0);
  const priced = suggestions.filter((row) => row.estimated_cost_minor !== null).length;
  const needs = agenda ? [...agenda.needed, ...agenda.lateOrders] : [];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Groceries</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Never run out again.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddConsumableButton householdId={householdId} />
          </div>
        </header>

        <SegmentedControl
          label="Groceries view"
          active={active}
          segments={[
            { key: "overview", label: "Overview", href: "/groceries", count: needs.length },
            { key: "list", label: "List", href: "/groceries?tab=list", count: suggestions.length },
            { key: "orders", label: "Orders", href: "/groceries?tab=orders" },
          ]}
        />

        {active === "overview" ? (
          <>
            <section>
              <SectionHeader title="Suggested order" count={suggestions.length} />
              {suggestions.length === 0 ? (
                <EmptyState icon={ShoppingBasket} tone="care" title="Nothing to order yet" description="WonderHome suggests an order once it can see what you use and how fast — from purchases, your pantry, or what you tell it." action={<AddConsumableButton householdId={householdId} />} />
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
                    <p className="text-sm text-[var(--wh-foreground-muted)]">
                      {suggestions.length} items{priced > 0 ? ` · est. ${formatMoney(total, currency)}${priced < suggestions.length ? " (partly priced)" : ""}` : ""}
                    </p>
                    <PillLink href="/groceries?tab=list" tone="primary">Review order</PillLink>
                  </div>
                </Card>
              )}
            </section>

            <section>
              <SectionHeader title="Smart insights" />
              {needs.length === 0 ? (
                <Card className="flex items-center gap-3 p-4">
                  <Sparkles aria-hidden className="size-5 shrink-0 text-[var(--wh-primary)]" />
                  <p className="text-sm text-[var(--wh-foreground-muted)]">
                    {agenda && agenda.checked > 0 ? `${agenda.checked} things watched, nothing running out. WonderHome will say when that changes.` : "Once WonderHome knows a few purchases it will tell you what's running low before it does."}
                  </p>
                </Card>
              ) : (
                <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{needs.map((item) => <AgendaRow key={item.subjectKey} item={item} href="/groceries?tab=list" />)}</ul></Card>
              )}
            </section>
          </>
        ) : null}

        {active === "list" ? (
          <>
            <MetricGrid metrics={[{ label: "Items", value: suggestions.length, icon: ShoppingBasket, tone: "care" }, { label: "Estimated", value: priced > 0 ? formatMoney(total, currency) : "—", icon: Lightbulb, tone: "money" }, { label: "Tracked", value: consumables.length, icon: PackageCheck, tone: "handled" }]} />
            {suggestions.length === 0 ? (
              <EmptyState icon={ShoppingBasket} tone="care" title="The list is empty" description="Suggestions arrive as WonderHome learns what you use. You can always ask it to add something." />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {suggestions.map((row) => (
                    <ActionRow
                      key={row.id}
                      icon={ShoppingBasket}
                      tone="care"
                      title={`${row.name} · ${row.quantity} ${row.unit}`}
                      meta={`${row.reason} (${describeBasis(row.evidence_basis)})${row.needed_by ? ` · by ${formatDate(timezone, new Date(row.needed_by))}` : ""}`}
                      action={row.estimated_cost_minor !== null && row.currency ? <Badge>{formatMoney(row.estimated_cost_minor, row.currency)}</Badge> : <Badge tone="neutral">unpriced</Badge>}
                    />
                  ))}
                </ul>
              </Card>
            )}
            <Card className="flex items-start gap-3 bg-[var(--wh-attention-soft)]/50 p-4">
              <Truck aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-attention)]" />
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                Placing the order needs a connected grocery provider. None is live yet, so WonderHome prepares and prices the basket and stops there — it never pretends an order went through.
              </p>
            </Card>
            <section>
              <SectionHeader title="What WonderHome tracks" count={consumables.length} />
              {consumables.length === 0 ? null : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {consumables.slice(0, 20).map((item) => {
                      const runsOut = expectedDepletion(item, now);
                      return (
                        <ActionRow
                          key={item.id}
                          icon={PackageCheck}
                          tone="care"
                          title={item.name}
                          meta={runsOut ? `Likely to run out ${formatDate(timezone, runsOut, "long")}` : "Not enough history to predict yet"}
                          action={
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
                            />
                          }
                        />
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
            <EmptyState icon={Truck} tone="care" title="No orders yet" description="Orders you approve appear here with their expected arrival. WonderHome chases anything that runs late." />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {orders.map((order) => (
                  <ActionRow
                    key={order.id}
                    icon={Truck}
                    tone="care"
                    title={`Order from ${order.provider}`}
                    meta={`${formatMoney(order.totalMinor, order.currency)}${order.expectedAt ? ` · expected ${formatDate(timezone, order.expectedAt, "long")}` : ""}`}
                    action={<Badge tone={order.status === "delivered" ? "handled" : order.status === "failed" || order.status === "cancelled" ? "risk" : "attention"}>{order.status.replace(/_/g, " ")}</Badge>}
                  />
                ))}
              </ul>
            </Card>
          )
        ) : null}

        <QuoteCard>Stocked up, stress down.</QuoteCard>
      </div>
    </AppShell>
  );
}
