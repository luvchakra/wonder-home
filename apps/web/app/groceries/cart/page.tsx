import { ExternalLink, ShoppingBasket, ShoppingCart, TriangleAlert } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { formatMoney, fromMinorUnits } from "@wonderhome/core/billing/money";
import { buildCart, pricePer, type CartLine } from "@wonderhome/core/commerce/cart";
import { instamartFromEnv, instamartSearchUrl } from "@wonderhome/core/commerce/instamart";
import { listGroceries } from "@wonderhome/core/commerce/inventory";
import { pricedPurchases } from "@wonderhome/core/commerce/repository";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { groceryIcon } from "@wonderhome/core/ui/grocery-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { groceryWords } from "../../_lib/grocery-words";
import { formatDate, requireSession } from "../../_lib/session";
import { sayAmount } from "../_components/amounts";

export const metadata = { title: "Cart" };
export const dynamic = "force-dynamic";

/**
 * The cart (backlog 25-021): the to-buy list with what each line is likely
 * to cost, priced only from receipts the household recorded (`buildCart`),
 * and the way to buy it online. Swiggy Instamart has no public ordering API;
 * until a partner agreement exists (`instamartFromEnv`), each item opens as
 * a search on Instamart and nothing is ordered from here.
 */
export default async function CartPage() {
  const session = await requireSession("/groceries/cart");
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/groceries/cart",
    back: { href: "/groceries?view=to-buy", label: t("nav.item.groceries") },
    title: t("grocery.cart.title"),
  };

  const [entitlement, items] = await Promise.all([
    may(supabase, householdId, "groceries.core"),
    listGroceries(supabase, householdId).catch(() => null),
  ]);
  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShoppingBasket} tone="care" title={t("groceries.notInPlan")} description={entitlement.reason} />
      </AppShell>
    );
  }
  if (items === null) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={TriangleAlert} tone="attention" title={t("grocery.loadError.title")} description={t("grocery.loadError.lede")} />
      </AppShell>
    );
  }

  const toBuy = items.filter((item) => item.toBuy);
  const purchases = await pricedPurchases(supabase, householdId, toBuy.map((item) => item.id)).catch(() => []);
  const cart = buildCart(
    toBuy.map((item) => ({ itemId: item.id, name: item.name, quantity: item.toBuy!.quantity, unit: item.toBuy!.unit })),
    purchases,
  );
  const byId = new Map(toBuy.map((item) => [item.id, item]));
  const words = groceryWords(t, viewer.language);
  const firstName = viewer.displayName.split(/\s+/)[0] ?? viewer.displayName;
  const money = (minor: number, currency: string) => formatMoney(fromMinorUnits(minor, currency), currency, viewer.language);
  const date = (iso: string) => formatDate(timezone, new Date(`${iso}T12:00:00Z`), "long");
  const instamart = instamartFromEnv();

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-[length:var(--wh-text-title)] leading-tight font-bold tracking-tight">
            {t("grocery.cart.greeting", { name: firstName })}
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("grocery.cart.lede")}</p>
        </header>

        {cart.lines.length === 0 ? (
          <EmptyState icon={ShoppingCart} tone="care" title={t("grocery.cart.empty")} description={t("grocery.cart.emptyLede")} />
        ) : (
          <>
            <Card className="space-y-1 p-4">
              {cart.totals.length > 0 ? (
                cart.totals.map((total) => (
                  <p key={total.currency} className="text-2xl font-bold tracking-tight">
                    {t("grocery.cart.total", { amount: money(total.minor, total.currency) })}
                  </p>
                ))
              ) : null}
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {cart.priced > 0
                  ? t("grocery.cart.totalCount", { priced: cart.priced, count: cart.lines.length })
                  : t("grocery.cart.totalNone")}
              </p>
            </Card>

            <section>
              <SectionHeader title={t("grocery.view.toBuy")} count={cart.lines.length} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {cart.lines.map((line) => {
                    const item = byId.get(line.itemId)!;
                    const picture = item.imageUrl ?? item.catalog?.imageUrl ?? null;
                    return (
                      <li key={line.itemId} className="flex items-start gap-3 px-2 py-3">
                        {picture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={picture} alt="" loading="lazy" className="size-10 shrink-0 rounded-[var(--wh-radius-sm)] object-cover" />
                        ) : (
                          <IconTile icon={groceryIcon(item.name, item.category)} tone="care" size="md" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold break-words">{line.name}</p>
                          <p className="text-sm text-[var(--wh-foreground-muted)]">
                            {sayAmount(words, { quantity: line.quantity, unit: line.unit }, item.unit)}
                          </p>
                          <p className="text-xs text-[var(--wh-foreground-subtle)]">{priceLine(line, t, money, date)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {line.price.kind === "estimate" ? (
                            <span className="font-semibold whitespace-nowrap">{money(line.price.minor, line.price.currency)}</span>
                          ) : null}
                          <a
                            href={instamartSearchUrl(line.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("grocery.cart.findOn", { name: line.name })}
                            className="inline-flex size-9 items-center justify-center rounded-full text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                          >
                            <ExternalLink aria-hidden className="size-4" />
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>

            <section>
              <SectionHeader title={t("grocery.cart.buyOnline")} />
              <Card className="flex items-start gap-3 p-4">
                <IconTile icon={ShoppingCart} tone="attention" size="md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold">Swiggy Instamart</p>
                  <p className="text-sm text-[var(--wh-foreground-muted)]">
                    {instamart ? t("grocery.cart.instamartOn") : t("grocery.cart.instamartOff")}
                  </p>
                </div>
              </Card>
            </section>
          </>
        )}

        <QuoteCard>{t("grocery.cart.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function priceLine(
  line: CartLine,
  t: Translate,
  money: (minor: number, currency: string) => string,
  date: (iso: string) => string,
): string {
  const price = line.price;
  if (price.kind === "none") return t("grocery.cart.noPrice");
  if (price.kind === "last_paid") return t("grocery.cart.lastPaid", { price: money(price.minor, price.currency), date: date(price.from.purchasedOn) });
  const rate = pricePer(price.perBaseMinor, price.baseUnit);
  const per = rate.per === "kg" || rate.per === "l" || rate.per === "pc" ? rate.per : "pc";
  const where = price.from.merchant
    ? t("grocery.cart.fromMerchant", { merchant: price.from.merchant, date: date(price.from.purchasedOn) })
    : t("grocery.cart.fromReceipt", { date: date(price.from.purchasedOn) });
  return `${t(`grocery.cart.rate.${per}`, { price: money(rate.minor, price.currency) })} · ${where}`;
}
