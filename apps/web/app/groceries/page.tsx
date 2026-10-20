import {
  CalendarClock,
  ChevronRight,
  PackageCheck,
  ShoppingBasket,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { may } from "@wonderhome/core/billing/repository";
import { cardNutrition, stepperOf } from "@wonderhome/core/commerce/catalog";
import {
  listGroceries,
  listRetiredGroceries,
  recentlyBought,
  stockStatus,
  type GroceryItem,
} from "@wonderhome/core/commerce/inventory";
import {
  useSoon,
  type RunningEntry,
  type UseFirstEntry,
} from "@wonderhome/core/commerce/use-soon";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { StatChips } from "@wonderhome/core/ui/stat-chips";
import { EmptyState } from "@wonderhome/core/ui/states";

import { groceryWords } from "../_lib/grocery-words";
import { formatDate, requireSession } from "../_lib/session";
import { AddItemButton } from "./_components/add-item";
import { fill, sayAmount } from "./_components/amounts";
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
  const toBuyCount = (items ?? []).filter((item) => item.toBuy).length;
  const atHomeCount = (items ?? []).filter(
    (item) => item.stock && item.stock.quantity > 0,
  ).length;
  const notCounted = (items ?? []).filter((item) => !item.stock).length;
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
          <div className="flex flex-wrap items-center gap-2">
          {toBuyCount > 0 ? (
            <ButtonLink variant="secondary" href="/groceries/cart">
              <ShoppingCart aria-hidden className="size-4" />
              {t("grocery.cart.open")} ({toBuyCount})
            </ButtonLink>
          ) : null}
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
              <UseSoon
                items={items}
                words={words}
                t={t}
                timezone={timezone}
                today={today}
              />
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

/**
 * Use soon (design §3.6, story 25-003c): dates someone knows, and what is at or
 * below its low level — never mixed. The rules are `commerce/use-soon.ts`: an
 * estimated date is never listed, a passed date says "check it before using",
 * and an amount says whether it was counted or worked out.
 */
function UseSoon({
  items,
  words,
  t,
  timezone,
  today,
}: {
  items: GroceryItem[];
  words: ReturnType<typeof groceryWords>;
  t: Translate;
  timezone: string;
  today: string;
}) {
  const { useFirst, running, estimatedHidden } = useSoon(items, today, timezone);
  const dayOn = (day: string) => formatDate(timezone, new Date(`${day}T12:00:00Z`));
  const amountOf = (item: GroceryItem) =>
    sayAmount(words, { quantity: item.stock!.quantity, unit: item.stock!.unit }, item.unit);

  if (useFirst.length === 0 && running.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={CalendarClock}
          tone="care"
          title={t("grocery.useSoon.empty")}
          description={t("grocery.useSoon.emptyLede")}
        />
        {estimatedHidden > 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {t("grocery.useSoon.estimatedNote")}
          </p>
        ) : null}
      </div>
    );
  }

  const row = (
    item: GroceryItem,
    lines: string[],
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
          {lines.map((line) => (
            <span
              key={line}
              className="block text-xs text-[var(--wh-foreground-muted)]"
            >
              {line}
            </span>
          ))}
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]"
        />
      </Link>
    </li>
  );

  const dateLine = (entry: UseFirstEntry) => {
    const date = dayOn(entry.useBy);
    const basis = t(`grocery.useSoon.basis.${entry.basis}`);
    if (entry.state === "passed")
      return t("grocery.useSoon.datePassed", { date, basis });
    if (entry.state === "today") return t("grocery.useSoon.dateToday", { basis });
    if (entry.days === 1) return t("grocery.useSoon.dateTomorrow", { basis });
    return t("grocery.useSoon.dateLater", { date, basis });
  };

  const amountLine = (entry: RunningEntry) => {
    const asOf = dayOn(entry.asOf);
    if (entry.status === "none") {
      return entry.knowledge === "counted"
        ? t("grocery.useSoon.noneCounted", { date: asOf })
        : t("grocery.useSoon.noneWorked");
    }
    return entry.knowledge === "counted"
      ? t("grocery.useSoon.amountCounted", { amount: amountOf(entry.item), date: asOf })
      : t("grocery.useSoon.amountWorked", { amount: amountOf(entry.item) });
  };

  return (
    <div className="space-y-5">
      {useFirst.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title={t("grocery.useSoon.useFirst")} />
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {t("grocery.useSoon.useFirstLede")}
          </p>
          <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-4 shadow-[var(--wh-shadow-card)]">
            {useFirst.map((entry) =>
              row(
                entry.item,
                [
                  dateLine(entry),
                  ...(entry.knowledge === "counted"
                    ? [t("grocery.useSoon.left", { amount: amountOf(entry.item) })]
                    : []),
                ],
                entry.state === "passed"
                  ? "risk"
                  : entry.state === "today" || entry.state === "soon"
                    ? "attention"
                    : "care",
              ),
            )}
          </ul>
        </section>
      ) : null}
      {running.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title={t("grocery.useSoon.running")} />
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {t("grocery.useSoon.runningLede")}
          </p>
          <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-4 shadow-[var(--wh-shadow-card)]">
            {running.map((entry) =>
              row(
                entry.item,
                [
                  amountLine(entry),
                  ...(entry.old ? [t("grocery.useSoon.old")] : []),
                ],
                entry.status === "none" ? "risk" : "attention",
              ),
            )}
          </ul>
        </section>
      ) : null}
      {estimatedHidden > 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">
          {t("grocery.useSoon.estimatedNote")}
        </p>
      ) : null}
    </div>
  );
}
