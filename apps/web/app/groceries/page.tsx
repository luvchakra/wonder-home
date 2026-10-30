import {
  CalendarClock,
  ChevronRight,
  PackageCheck,
  ShoppingBasket,
  Store,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { may } from "@wonderhome/core/billing/repository";
import { cardNutrition, stepperOf } from "@wonderhome/core/commerce/catalog";
import { instamartMode } from "@wonderhome/core/commerce/instamart/config";
import {
  listGroceries,
  listRetiredGroceries,
  recentlyBought,
  groceryTabCounts,
  stockStatus,
  type GroceryItem,
} from "@wonderhome/core/commerce/inventory";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { groceryWords } from "../_lib/grocery-words";
import { formatDate, requireSession } from "../_lib/session";
import { AddItemButton } from "./_components/add-item";
import { fill, sayAmount } from "./_components/amounts";
import { GroceryList, type ListItem } from "./_components/grocery-list";

export const metadata = { title: "Groceries" };
export const dynamic = "force-dynamic";

type View = "all" | "in-kitchen" | "to-buy";

/**
 * Groceries (Groceries Phase 1, design/GROCERIES-PANTRY-HOMETALK-PHASE0.md §3):
 * one list of everything the household keeps, each row with what is at home
 * and what to buy side by side. "In Kitchen" and "To Buy" are views of the same
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
  // Old links: "use-soon" (a dropped tab) lands on In Kitchen.
  const view: View =
    requested === "to-buy"
      ? "to-buy"
      : requested === "in-kitchen" || requested === "use-soon"
        ? "in-kitchen"
        : "all";
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

  // The list is read alongside the plan check, not after it: it is the
  // household's own rows through its own access rules, and if the plan says
  // no, nothing read is shown.
  const twoWeeksAgo = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(new Date(now.getTime() - 14 * 86_400_000));
  const lists = Promise.all([
    listGroceries(supabase, householdId).catch(() => null),
    listRetiredGroceries(supabase, householdId).catch(() => []),
    view === "to-buy"
      ? recentlyBought(supabase, householdId, twoWeeksAgo).catch(() => [])
      : Promise.resolve([]),
  ]);
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
  const [items, retired, bought] = await lists;

  const canMarkBought = membership.memberType === "adult";
  const firstName = viewer.displayName.split(/\s+/)[0] ?? viewer.displayName;
  const counts = groceryTabCounts(items ?? []);
  // Energy and protein per 100 g under each name, from the source the item page credits (25-012).
  const number = new Intl.NumberFormat(viewer.language, { maximumFractionDigits: 1 });
  const nutritionOf = (item: GroceryItem): string | null => {
    const facts = cardNutrition(item.catalog);
    if (!facts) return null;
    const parts = [
      facts.energyKcal !== null ? fill(words.row.kcal, { value: number.format(Math.round(facts.energyKcal)) }) : null,
      facts.proteinG !== null ? fill(words.row.protein, { value: number.format(facts.proteinG) }) : null,
    ].filter(Boolean);
    return `${parts.join(" · ")} ${facts.basis === "100ml" ? words.row.per100ml : words.row.per100g}`;
  };
  const listItems: ListItem[] = (items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    aliases: item.aliases,
    category: item.category,
    unit: item.unit,
    step: item.step,
    ...stepperOf(item),
    imageUrl: item.imageUrl ?? item.catalog?.imageUrl ?? null,
    nutrition: nutritionOf(item),
    updatedAt: item.updatedAt,
    status: stockStatus(item),
    stockText: item.stock
      ? sayAmount(
          words,
          { quantity: item.stock.quantity, unit: item.stock.unit },
          item.unit,
        )
      : "—",
    stock: item.stock ? item.stock.quantity : null,
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
          {/* One way to add; To buy is the shopping list itself. Ordering it on Instamart is its own page (25-032). */}
          <div className="flex w-full items-center gap-3">
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
          {/* Ordering the list on Instamart (25-032): an adult's, only where the deployment has it on. */}
          {canMarkBought && instamartMode() !== "off" ? (
            <Link
              href="/groceries/order"
              className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]"
            >
              <Store aria-hidden className="size-4" />
              {t("instamart.entry")}
            </Link>
          ) : null}
          </div>
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
              key: "in-kitchen",
              label: t("grocery.view.inKitchen"),
              href: "/groceries?view=in-kitchen",
              count: counts.inKitchen,
            },
            {
              key: "to-buy",
              label: t("grocery.view.toBuy"),
              href: "/groceries?view=to-buy",
              count: counts.toBuy,
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
            <GroceryList
              householdId={householdId}
              items={listItems}
              view={view}
              words={words}
              canMarkBought={canMarkBought}
              today={today}
            />

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
