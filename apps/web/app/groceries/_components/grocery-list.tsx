"use client";

import { CircleCheck, CircleHelp, Search, ShoppingBasket, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { SwipeToDismiss } from "@wonderhome/core/ui/swipe-to-dismiss";

import { adjustListAction } from "../../(auth)/grocery-actions";
import { newKey } from "./amounts";

const SWIPE_HINT_KEY = "wh.groceries.swipeHint";

import {
  GroceryRow,
  type GroceryStatus,
} from "@wonderhome/core/ui/grocery-row";
import { MetricCard } from "@wonderhome/core/ui/metric-card";
import { EmptyState } from "@wonderhome/core/ui/states";
import type { Ladder } from "@wonderhome/core/commerce/buying-sizes";

import type { GroceryWords } from "../../_lib/grocery-words";
import { fill } from "./amounts";
import { MarkBoughtButton } from "./mark-bought";
import { StockStepper } from "./stock-stepper";
import { ToBuyStepper } from "./to-buy-stepper";

export type ListItem = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  unit: string;
  step: number | null;
  /** What + and − step through, and where the cart button starts (25-010). */
  ladder: Ladder;
  start: number;
  imageUrl: string | null;
  /** "155 kcal · 13 g protein per 100 g", or null when no source has it (25-012). */
  nutrition: string | null;
  status: GroceryStatus;
  stockText: string;
  /** What is at home, in the item's base unit; null when nobody has counted it. */
  stock: number | null;
  toBuy: { entryId: string; quantity: number; unit: string } | null;
};

/**
 * The one Groceries list (design §3.1): search, a category filter and a
 * row per item with what is at home and what to buy side by side, each with
 * its own − amount + (an adult changes what is at home right here). "To buy"
 * is the same rows, narrowed to what is on the list — one list, no category
 * headings (the owner, 2026-10-20) — under three cards: At home, Not
 * counted yet, and Mark as bought, which is the action itself.
 */
export function GroceryList({
  householdId,
  items,
  view,
  words,
  canMarkBought,
  today,
}: {
  householdId: string;
  items: ListItem[];
  view: "all" | "to-buy";
  words: GroceryWords;
  /** An adult: marks things bought and changes what is at home. */
  canMarkBought: boolean;
  /** The household's own date, for "Bought on". */
  today: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  // At home and Not counted yet are ways in (the owner, 2026-10-20: "make the cards clickable"):
  // a tap shows just the items they count, a second tap goes back to the list.
  const [stockFilter, setStockFilter] = useState<"home" | "uncounted" | null>(null);
  // What the steppers have saved since the page was read, so "To buy" and its button follow along.
  const [onList, setOnList] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      items.map((item) => [item.id, item.toBuy?.quantity ?? 0]),
    ),
  );

  const categories = useMemo(
    () =>
      [...new Set(items.map((item) => item.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [items],
  );
  const needle = query.trim().toLowerCase();
  const shown = items.filter(
    (item) =>
      // To buy follows the steppers: an item taken off the list leaves this view at once and stays under All.
      // A card's filter shows every item it counts, on the list or not, as its number does.
      (stockFilter === "home"
        ? item.stock !== null && item.stock > 0
        : stockFilter === "uncounted"
          ? item.stock === null
          : view === "all" || (onList[item.id] ?? 0) > 0) &&
      (!category || item.category === category) &&
      (!needle ||
        [item.name, item.category, ...item.aliases].some((text) =>
          text.toLowerCase().includes(needle),
        )),
  );

  const toBuyNow = items.filter(
    (item) => item.toBuy && (onList[item.id] ?? 0) > 0,
  );

  const atHome = items.filter((item) => item.stock !== null && item.stock > 0).length;
  const notCounted = items.filter((item) => item.stock === null).length;
  const boughtLines = toBuyNow.map((item) => ({
    entryId: item.toBuy!.entryId,
    itemId: item.id,
    name: item.name,
    unit: item.unit,
    quantity: onList[item.id] ?? item.toBuy!.quantity,
    baseUnit: item.toBuy!.unit,
  }));

  // On To buy, a row swiped left or right comes off the list (the owner,
  // 2026-10-20): To buy goes to nothing, it leaves this view and stays under
  // All. The first row jiggles once per device so the swipe can be found.
  const takeOff = async (item: ListItem): Promise<boolean> => {
    const result = await adjustListAction({ householdId, itemId: item.id, kind: "remove", key: newKey("swipe") });
    if (!result.ok) return false;
    setOnList((current) => ({ ...current, [item.id]: 0 }));
    router.refresh();
    return true;
  };
  const [hintShown] = useState(() => {
    try {
      const seen = window.localStorage.getItem(SWIPE_HINT_KEY) === "1";
      if (!seen) window.localStorage.setItem(SWIPE_HINT_KEY, "1");
      return seen;
    } catch {
      return true;
    }
  });

  const row = (item: ListItem, index = 0) =>
    view === "to-buy" ? (
      <SwipeToDismiss key={`${item.id}:${item.unit}`} label={words.stepper.remove} hint={!hintShown && index === 0} onDismiss={() => takeOff(item)}>
        {rowBody(item, "div")}
      </SwipeToDismiss>
    ) : (
      rowBody(item, "li")
    );

  const rowBody = (item: ListItem, as: "li" | "div") => (
    <GroceryRow
      as={as}
      // A new unit is a new stepper: its amounts are in another base (25-012).
      key={`${item.id}:${item.unit}`}
      name={item.name}
      category={item.category}
      href={`/groceries/${item.id}`}
      imageUrl={item.imageUrl}
      nutrition={item.nutrition}
      status={item.status}
      statusLabel={words.status[item.status]}
      stockLabel={words.inStock}
      stockText={item.stockText}
      stockControl={
        canMarkBought ? (
          <StockStepper householdId={householdId} item={item} initial={item.stock} words={words} />
        ) : undefined
      }
      toBuyLabel={words.toBuy}
      openLabel={fill(words.open, { name: item.name })}
      stepper={
        <ToBuyStepper
          householdId={householdId}
          item={item}
          initial={
            item.toBuy
              ? { quantity: item.toBuy.quantity, unit: item.toBuy.unit }
              : null
          }
          words={words}
          onChange={(quantity) =>
            setOnList((current) => ({ ...current, [item.id]: quantity }))
          }
        />
      }
    />
  );

  return (
    <div className="space-y-3">
      {view === "to-buy" && items.length > 0 ? (
        // Three across, by the owner's call (an exception to rule 19): labels wrap, never cut.
        <ul className="grid grid-cols-3 gap-2.5">
          <li className="min-w-0">
            <MetricCard
              stacked
              label={words.summary.atHome}
              value={atHome}
              icon={CircleCheck}
              tone="handled"
              pressed={stockFilter === "home"}
              disabled={atHome === 0}
              onClick={() => setStockFilter((current) => (current === "home" ? null : "home"))}
            />
          </li>
          <li className="min-w-0">
            <MetricCard
              stacked
              label={words.summary.notCounted}
              value={notCounted}
              icon={CircleHelp}
              tone="attention"
              pressed={stockFilter === "uncounted"}
              disabled={notCounted === 0}
              onClick={() => setStockFilter((current) => (current === "uncounted" ? null : "uncounted"))}
            />
          </li>
          <li className="min-w-0">
            {canMarkBought && toBuyNow.length > 0 ? (
              <MarkBoughtButton
                householdId={householdId}
                today={today}
                words={words}
                lines={boughtLines}
                trigger={(open) => (
                  <MetricCard stacked label={words.bought.open} value={toBuyNow.length} icon={ShoppingCart} tone="primary" onClick={open} />
                )}
              />
            ) : (
              <MetricCard stacked label={words.bought.open} value={toBuyNow.length} icon={ShoppingCart} tone="primary" />
            )}
          </li>
        </ul>
      ) : null}

      <div className="relative">
        <label htmlFor="grocery-search" className="sr-only">
          {words.search}
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]"
        />
        <input
          id="grocery-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={words.search}
          autoComplete="off"
          className="block h-11 w-full rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] pr-4 pl-10 text-[0.9375rem] shadow-[var(--wh-shadow-card)] placeholder:text-[var(--wh-foreground-subtle)] focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
        />
      </div>

      {categories.length > 1 ? (
        <div
          role="group"
          aria-label={words.filterLegend}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[null, ...categories].map((name) => {
            const pressed = category === name;
            return (
              <button
                key={name ?? "all"}
                type="button"
                aria-pressed={pressed}
                onClick={() => setCategory(name)}
                className={`min-h-9 shrink-0 rounded-[var(--wh-radius-pill)] border px-3.5 text-sm font-medium whitespace-nowrap first-letter:uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] ${
                  pressed
                    ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
                    : "border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)]"
                }`}
              >
                {name ?? words.filterAll}
              </button>
            );
          })}
        </div>
      ) : null}

      {shown.length === 0 ? (
        needle || category ? (
          <p className="rounded-[var(--wh-radius)] bg-[var(--wh-surface)] p-4 text-sm text-[var(--wh-foreground-muted)]">
            {fill(words.empty.noMatch, {
              query: query.trim() || (category ?? ""),
            })}
          </p>
        ) : view === "to-buy" ? (
          <EmptyState
            icon={ShoppingBasket}
            tone="care"
            title={words.toBuyEmpty.title}
            description={words.toBuyEmpty.lede}
          />
        ) : (
          <EmptyState
            icon={ShoppingBasket}
            tone="care"
            title={words.empty.title}
            description={words.empty.lede}
          />
        )
      ) : (
        <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-2 shadow-[var(--wh-shadow-card)]">
          {shown.map((item, index) => row(item, index))}
        </ul>
      )}
    </div>
  );
}
