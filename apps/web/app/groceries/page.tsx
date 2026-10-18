import {
  CalendarClock,
  ChevronRight,
  PackageCheck,
  ShoppingBasket,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { may } from "@wonderhome/core/billing/repository";
import {
  listGroceries,
  listRetiredGroceries,
  recentlyBought,
  stockStatus,
  type GroceryItem,
} from "@wonderhome/core/commerce/inventory";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { StatChips } from "@wonderhome/core/ui/stat-chips";
import { EmptyState } from "@wonderhome/core/ui/states";

import { groceryWords } from "../_lib/grocery-words";
import { formatDate, requireSession } from "../_lib/session";
import { AddItemButton } from "./_components/add-item";
import { sayAmount } from "./_components/amounts";
import { GroceryList, type ListItem } from "./_components/grocery-list";

export const metadata = { title: "Groceries" };
export const dynamic = "force-dynamic";

type View = "all" | "to-buy" | "use-soon";

/**
 * Groceries (Groceries Phase 1, design/GROCERIES-PANTRY-HOMETALK-PHASE0.md §3):
 * one list of everything the household keeps, each row with what is at home
 * and what to buy side by side. "To buy" and "Use soon" are views of the same
 * records, never a second list. Nothing here guesses how much is at home:
 * an amount nobody confirmed is "not counted yet".
 */
export default async function GroceriesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ view: requested }, session] = await Promise.all([
    searchParams,
    requireSession("/groceries"),
  ]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const view: View =
    requested === "to-buy" || requested === "use-soon" ? requested : "all";
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    now,
  );
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/groceries",
    back: { href: "/more", label: t("common.back") },
    title: t("nav.item.groceries"),
  };

  const entitlement = await may(supabase, householdId, "groceries.core");
  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={ShoppingBasket}
          tone="care"
          title={t("groceries.notInPlan")}
          description={entitlement.reason}
        />
      </AppShell>
    );
  }

  const words = groceryWords(t, viewer.language);
  const twoWeeksAgo = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(new Date(now.getTime() - 14 * 86_400_000));
  const [items, retired, bought] = await Promise.all([
    listGroceries(supabase, householdId).catch(() => null),
    listRetiredGroceries(supabase, householdId).catch(() => []),
    view === "to-buy"
      ? recentlyBought(supabase, householdId, twoWeeksAgo).catch(() => [])
      : Promise.resolve([]),
  ]);

  const canMarkBought = membership.memberType === "adult";
  const firstName = viewer.displayName.split(/\s+/)[0] ?? viewer.displayName;
  const toBuyCount = (items ?? []).filter((item) => item.toBuy).length;
  const atHomeCount = (items ?? []).filter(
    (item) => item.stock && item.stock.quantity > 0,
  ).length;
  const notCounted = (items ?? []).filter((item) => !item.stock).length;
  const listItems: ListItem[] = (items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    aliases: item.aliases,
    category: item.category,
    unit: item.unit,
    step: item.step,
    imageUrl: item.imageUrl,
    status: stockStatus(item),
    stockText: item.stock
      ? sayAmount(
          words,
          { quantity: item.stock.quantity, unit: item.stock.unit },
          item.unit,
        )
      : "—",
    toBuy: item.toBuy
      ? {
          entryId: item.toBuy.entryId,
          quantity: item.toBuy.quantity,
          unit: item.toBuy.unit,
        }
      : null,
  }));
  const categories = [
    ...new Set([
      ...(items ?? []).map((item) => item.category),
      ...words.categories,
    ]),
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[length:var(--wh-text-title)] leading-tight font-bold tracking-tight">
              {t("grocery.greeting", { name: firstName })}
            </h1>
            <p className="mt-1 text-sm text-[var(--wh-foreground-muted)]">
              {t("grocery.lede")}
            </p>
          </div>
          <AddItemButton
            householdId={householdId}
            items={(items ?? []).map((item) => ({
              id: item.id,
              name: item.name,
              aliases: item.aliases,
              category: item.category,
              unit: item.unit,
              step: item.step,
              onList: Boolean(item.toBuy),
              catalogId: item.catalog?.id ?? null,
            }))}
            retired={retired}
            categories={categories}
            words={words}
          />
        </header>

        <SegmentedControl
          label={t("grocery.view.label")}
          active={view}
          segments={[
            {
              key: "all",
              label: t("grocery.view.all"),
              href: "/groceries",
              count: items?.length,
            },
            {
              key: "to-buy",
              label: t("grocery.view.toBuy"),
              href: "/groceries?view=to-buy",
              count: toBuyCount,
            },
            {
              key: "use-soon",
              label: t("grocery.view.useSoon"),
              href: "/groceries?view=use-soon",
            },
          ]}
        />

        {items === null ? (
          <EmptyState
            icon={TriangleAlert}
            tone="attention"
            title={t("grocery.loadError.title")}
            description={t("grocery.loadError.lede")}
          />
        ) : (
          <>
            {view === "to-buy" && items.length > 0 ? (
              <StatChips
                stats={[
                  {
                    label: t("grocery.summary.toBuy"),
                    value: toBuyCount,
                    tone: "info",
                  },
                  {
                    label: t("grocery.summary.atHome"),
                    value: atHomeCount,
                    tone: "handled",
                  },
                  {
                    label: t("grocery.summary.notCounted"),
                    value: notCounted,
                    tone: "attention",
                  },
                ]}
              />
            ) : null}

            {view === "use-soon" ? (
              <UseSoon items={items} words={words} t={t} timezone={timezone} />
            ) : (
              <GroceryList
                householdId={householdId}
                items={listItems}
                view={view}
                words={words}
                canMarkBought={canMarkBought}
                today={today}
              />
            )}

            {view === "to-buy" ? (
              <section className="space-y-2">
                <SectionHeader title={t("grocery.recent.title")} />
                {bought.length === 0 ? (
                  <p className="rounded-[var(--wh-radius)] bg-[var(--wh-surface)] p-4 text-sm text-[var(--wh-foreground-muted)]">
                    {t("grocery.recent.empty")}
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-4 shadow-[var(--wh-shadow-card)]">
                    {bought.map((line) => (
                      <li
                        key={line.purchaseId}
                        className="flex items-center gap-3 py-3"
                      >
                        <IconTile
                          icon={PackageCheck}
                          tone="handled"
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium break-words">
                            {line.name}
                          </span>
                          <span className="block text-xs text-[var(--wh-foreground-muted)]">
                            {sayAmount(words, {
                              quantity: line.quantity,
                              unit: line.unit,
                            })}{" "}
                            ·{" "}
                            {formatDate(
                              timezone,
                              new Date(`${line.boughtOn}T12:00:00Z`),
                            )}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </>
        )}

        <QuoteCard>{t("grocery.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

/** Use soon (design §3.6): dates someone read off the pack, and what is at or below its low level — never mixed, never estimated. */
function UseSoon({
  items,
  words,
  t,
  timezone,
}: {
  items: GroceryItem[];
  words: ReturnType<typeof groceryWords>;
  t: Translate;
  timezone: string;
}) {
  const dated = items
    .filter((item) => item.stock?.useBy && item.stock.quantity > 0)
    .sort((a, b) => a.stock!.useBy!.localeCompare(b.stock!.useBy!));
  const low = items.filter((item) => {
    const status = stockStatus(item);
    return status === "low" || (status === "none" && item.lowLevel !== null);
  });

  if (dated.length === 0 && low.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        tone="care"
        title={t("grocery.useSoon.empty")}
        description={t("grocery.useSoon.emptyLede")}
      />
    );
  }

  const row = (
    item: GroceryItem,
    line: string,
    tone: "attention" | "risk" | "care",
  ) => (
    <li key={item.id}>
      <Link
        href={`/groceries/${item.id}`}
        className="flex items-center gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <IconTile
          icon={tone === "care" ? CalendarClock : TriangleAlert}
          tone={tone}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium break-words">
            {item.name}
          </span>
          <span className="block text-xs text-[var(--wh-foreground-muted)]">
            {line}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]"
        />
      </Link>
    </li>
  );

  return (
    <div className="space-y-5">
      {dated.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title={t("grocery.useSoon.useFirst")} />
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {t("grocery.useSoon.useFirstLede")}
          </p>
          <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-4 shadow-[var(--wh-shadow-card)]">
            {dated.map((item) =>
              row(
                item,
                `${t("grocery.useSoon.useBy", { date: formatDate(timezone, new Date(`${item.stock!.useBy}T12:00:00Z`)) })} · ${t("grocery.useSoon.left", { amount: sayAmount(words, { quantity: item.stock!.quantity, unit: item.stock!.unit }, item.unit) })}`,
                "care",
              ),
            )}
          </ul>
        </section>
      ) : null}
      {low.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title={t("grocery.useSoon.running")} />
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {t("grocery.useSoon.runningLede")}
          </p>
          <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-4 shadow-[var(--wh-shadow-card)]">
            {low.map((item) =>
              row(
                item,
                t("grocery.useSoon.left", {
                  amount: sayAmount(
                    words,
                    { quantity: item.stock!.quantity, unit: item.stock!.unit },
                    item.unit,
                  ),
                }),
                item.stock!.quantity <= 0 ? "risk" : "attention",
              ),
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
