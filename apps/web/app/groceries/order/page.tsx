import { PackageCheck, ShoppingBasket, Store } from "lucide-react";
import { notFound } from "next/navigation";

import type { InstamartAddress } from "@wonderhome/core/commerce/instamart/client";
import { instamartMode } from "@wonderhome/core/commerce/instamart/config";
import { connectionFor, INSTAMART_PROVIDER, instamartFor, InstamartUnavailable } from "@wonderhome/core/commerce/instamart/service";
import { createAdminClient } from "@wonderhome/core/db/admin";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Badge } from "@wonderhome/core/ui/pill";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { requireSession } from "../../_lib/session";
import { disconnectInstamartAction, refreshOrdersAction, stockOrderAction, type Problem } from "./actions";
import { InstamartOrder, PoweredByInstamart, type InstamartWords } from "./instamart-order";

export const metadata = { title: "Order on Instamart" };
export const dynamic = "force-dynamic";

const PROBLEMS: Problem[] = ["off", "not_adult", "not_connected", "reconnect", "busy", "unreachable", "nothing", "invalid"];

/**
 * Ordering the To buy list on Swiggy Instamart (story 25-032). Off unless the
 * deployment turns it on; only adults order, each on their own Swiggy account.
 * The page reads who is connected and their recent orders; the flow itself
 * (match, review, place) is the client component's, each step a server
 * action that checks everything again.
 */
export default async function InstamartOrderPage({ searchParams }: { searchParams: Promise<{ problem?: string; done?: string; count?: string }> }) {
  if (instamartMode() === "off") notFound();
  const [query, session] = await Promise.all([searchParams, requireSession("/groceries/order")]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t, format } = locale;
  const householdId = membership.household.id;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/groceries/order",
    back: { href: "/groceries?view=to-buy", label: t("nav.item.groceries") },
    title: t("instamart.title"),
  };
  const firstName = viewer.displayName.split(/\s+/)[0] ?? viewer.displayName;

  if (membership.memberType !== "adult") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={Store} tone="home" title={t("instamart.title")} description={t("instamart.adultsOnly")} />
      </AppShell>
    );
  }

  const admin = createAdminClient();
  const actor = { householdId, memberId: membership.memberId, memberType: membership.memberType };
  const [connection, { data: orderRows }] = await Promise.all([
    connectionFor(admin, membership.memberId),
    supabase
      .from("orders")
      .select("id, status, total_minor, currency, placed_at, stocked_at, failure_code")
      .eq("household_id", householdId)
      .eq("provider", INSTAMART_PROVIDER)
      .eq("placed_by_member_id", membership.memberId)
      .in("status", ["placed", "confirmed", "shipped", "delivered", "cancelled", "failed", "pending_approval"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // The person's Swiggy addresses, read live and never kept.
  let addresses: InstamartAddress[] = [];
  let state: "connect" | "reconnect" | "ready" | "unreachable" = connection?.status === "connected" ? "ready" : connection?.status === "needs_reconnect" ? "reconnect" : "connect";
  if (state === "ready") {
    try {
      addresses = await (await instamartFor(admin, actor)).addresses();
    } catch (thrown) {
      state = thrown instanceof InstamartUnavailable && (thrown.reason === "reconnect" || thrown.reason === "not_connected") ? "reconnect" : "unreachable";
    }
  }

  const problem = PROBLEMS.includes(query.problem as Problem) || query.problem === "declined" || query.problem === "expired" ? query.problem : null;
  const count = Math.max(0, Number(query.count) || 0);
  const done =
    query.done === "connected"
      ? t("instamart.done.connected")
      : query.done === "disconnected"
        ? t("instamart.done.disconnected")
        : query.done === "stocked"
          ? t("instamart.done.stocked", { count })
          : null;

  const words: InstamartWords = {
    deliverTo: t("instamart.address.label"),
    match: t("instamart.match.button"),
    matching: t("instamart.match.working"),
    matchLede: t("instamart.match.lede"),
    wanted: t("instamart.line.wanted", { amount: "{amount}" }),
    notFound: t("instamart.line.none"),
    product: t("instamart.line.product"),
    packs: t("instamart.line.packs"),
    fewer: t("instamart.line.fewer", { name: "{name}" }),
    more: t("instamart.line.more", { name: "{name}" }),
    leaveOut: t("instamart.line.leaveOut"),
    review: t("instamart.review.button"),
    reviewing: t("instamart.review.working"),
    cartTitle: t("instamart.cart.title"),
    deliveredTo: t("instamart.cart.deliverTo", { address: "{address}" }),
    payWith: t("instamart.cart.payment"),
    payments: { COD: t("instamart.payment.cod"), SwiggyPay: t("instamart.payment.swiggyMoney") },
    noPayment: t("instamart.cart.noPayment"),
    place: t("instamart.place.button"),
    placing: t("instamart.place.working"),
    placeNote: t("instamart.place.note"),
    placedDefault: t("instamart.placed.default"),
    placedPartial: t("instamart.placed.partial"),
    changed: t("instamart.changed"),
    unknown: t("instamart.unknown"),
    refused: t("instamart.refused", { message: "{message}" }),
    problems: Object.fromEntries(PROBLEMS.map((key) => [key, t(`instamart.problem.${key}` as TranslationKey)])) as Record<Problem, string>,
    badge: t("instamart.badge"),
  };

  const orders = (orderRows ?? []) as { id: string; status: string; total_minor: number; currency: string; placed_at: string | null; stocked_at: string | null; failure_code: string | null }[];
  const openOrders = orders.some((order) => ["placed", "confirmed", "shipped"].includes(order.status));

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="space-y-2">
          <h1 className="text-[length:var(--wh-text-title)] leading-tight font-bold tracking-tight">{t("instamart.headline")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("instamart.lede", { name: firstName })}</p>
          <PoweredByInstamart label={t("instamart.badge")} />
        </header>

        {done ? <Alert tone="info">{done}</Alert> : null}
        {problem ? <Alert tone="attention">{t(`instamart.problem.${problem}` as TranslationKey)}</Alert> : null}

        {orders.length > 0 ? (
          <section aria-labelledby="instamart-orders" className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 id="instamart-orders" className="text-base font-semibold">{t("instamart.orders.title")}</h2>
              {openOrders && state === "ready" ? (
                <form action={refreshOrdersAction}>
                  <input type="hidden" name="householdId" value={householdId} />
                  <Button type="submit" variant="quiet" className="rounded-[var(--wh-radius-pill)]">{t("instamart.orders.refresh")}</Button>
                </form>
              ) : null}
            </div>
            <ul className="space-y-2">
              {orders.map((order) => {
                const canStock = !order.stocked_at && ["placed", "confirmed", "shipped", "delivered"].includes(order.status);
                return (
                  <li key={order.id}>
                    <Card className="flex flex-wrap items-start gap-3">
                      <IconTile icon={order.status === "delivered" ? PackageCheck : ShoppingBasket} tone="home" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          {t(`instamart.status.${order.status}` as TranslationKey)}
                          {order.stocked_at ? <Badge tone="handled">{t("instamart.orders.stocked")}</Badge> : null}
                        </p>
                        <p className="text-sm text-[var(--wh-foreground-muted)]">
                          {[order.placed_at ? t("instamart.orders.placedOn", { date: format.date(order.placed_at, "long") }) : null, order.total_minor > 0 ? format.money(order.total_minor / 100, order.currency) : null].filter(Boolean).join(" · ")}
                        </p>
                        {order.status === "pending_approval" && order.failure_code === "outcome_unknown" ? <p className="text-sm">{t("instamart.unknown")}</p> : null}
                      </div>
                      {canStock ? (
                        <form action={stockOrderAction}>
                          <input type="hidden" name="householdId" value={householdId} />
                          <input type="hidden" name="orderId" value={order.id} />
                          <Button type="submit" variant={order.status === "delivered" ? "primary" : "secondary"} className="rounded-[var(--wh-radius-pill)]">
                            {t("instamart.orders.stock")}
                          </Button>
                        </form>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {state === "ready" ? (
          addresses.length === 0 ? (
            <EmptyState icon={Store} tone="home" title={t("instamart.address.label")} description={t("instamart.address.none")} />
          ) : (
            <InstamartOrder householdId={householdId} addresses={addresses} defaultAddressId={addresses[0]?.id ?? null} language={viewer.language ?? "en"} words={words} />
          )
        ) : state === "unreachable" ? (
          <Alert tone="attention">{t("instamart.problem.unreachable")}</Alert>
        ) : (
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <IconTile icon={Store} tone="home" />
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold">{t("instamart.connect.title")}</h2>
                <p className="text-sm text-[var(--wh-foreground-muted)]">{state === "reconnect" ? t("instamart.connect.reconnect") : t("instamart.description")}</p>
              </div>
            </div>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("instamart.connect.body")}</p>
            {/* A plain link, not a client-side route: the browser leaves for Swiggy's own sign-in page. */}
            <a
              href={`/groceries/order/connect?household=${householdId}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary)] px-4 text-sm font-medium text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)] sm:w-auto"
            >
              {t("instamart.connect.button")}
            </a>
          </Card>
        )}

        {connection?.status === "connected" || connection?.status === "needs_reconnect" ? (
          <form action={disconnectInstamartAction} className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-[var(--wh-foreground-muted)]">
            <input type="hidden" name="householdId" value={householdId} />
            <span>{t("instamart.connected")}</span>
            <Button type="submit" variant="quiet" className="rounded-[var(--wh-radius-pill)]">{t("instamart.disconnect")}</Button>
          </form>
        ) : null}

        <QuoteCard>{t("instamart.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
