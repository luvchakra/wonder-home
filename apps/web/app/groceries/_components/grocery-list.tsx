"use client";

import { ArrowDownUp, Search, ShoppingBasket, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SwipeToDismiss } from "@wonderhome/core/ui/swipe-to-dismiss";

import { adjustListAction, retireGroceryItemAction } from "../../(auth)/grocery-actions";
import { newKey } from "./amounts";
import { removeBySwipe } from "./swipe-remove";

const SWIPE_HINT_KEY = "wh.groceries.swipeHint";
const SORT_KEY = "wh.groceries.sort";

/** How the list is ordered: by name (the default) or most recently touched. */
export type GrocerySort = "name" | "recent";

import {
  GroceryRow,
  type GroceryStatus,
} from "@wonderhome/core/ui/grocery-row";
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
  /** When the item, its stock or its to-buy was last touched — for "Recently updated". */
  updatedAt: string;
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
 * headings (the owner, 2026-10-20) — with Mark as bought as its one action.
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
  view: "all" | "in-kitchen" | "to-buy";
  words: GroceryWords;
  /** An adult: marks things bought and changes what is at home. */
  canMarkBought: boolean;
  /** The household's own date, for "Bought on". */
  today: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  // The sort is a per-device choice (the swipe hint already uses localStorage):
  // it opens on the saved order, falling back to name. Written on every change.
  const [sort, setSort] = useState<GrocerySort>("name");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(SORT_KEY);
    } catch {
      /* no stored preference */
    }
    if (saved !== "recent" && saved !== "name") return;
    // Reading the browser's own storage has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSort(saved);
  }, []);
  const chooseSort = (next: GrocerySort) => {
    setSort(next);
    try {
      window.localStorage.setItem(SORT_KEY, next);
    } catch {
      /* preference not saved this time */
    }
  };
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
  // Stable, with a clear tiebreak: "recent" is newest first and falls back to
  // name, "name" is the server's own order (name asc) made explicit. The id
  // breaks a tie so the order never flickers between reads.
  const byName = (a: ListItem, b: ListItem) =>
    a.name.localeCompare(b.name, words.language) || a.id.localeCompare(b.id);
  const compare =
    sort === "recent"
      ? (a: ListItem, b: ListItem) =>
          (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) ||
          byName(a, b)
      : byName;
  const shown = items
    .filter(
      (item) =>
      // To buy follows the steppers: an item taken off the list leaves this view at once and stays under All.
      (view === "all"
        ? true
        : view === "in-kitchen"
          ? item.stock !== null && item.stock > 0
          : (onList[item.id] ?? 0) > 0) &&
      (!category || item.category === category) &&
      (!needle ||
        [item.name, item.category, ...item.aliases].some((text) =>
          text.toLowerCase().includes(needle),
        )),
    )
    .sort(compare);

  const toBuyNow = items.filter(
    (item) => item.toBuy && (onList[item.id] ?? 0) > 0,
  );

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
    const gone = await removeBySwipe({
      view,
      itemId: item.id,
      onList: onList[item.id] ?? 0,
      takeOffList: () => adjustListAction({ householdId, itemId: item.id, kind: "remove", key: newKey("swipe") }),
      stopTracking: () => retireGroceryItemAction({ householdId, itemId: item.id }),
    });
    if (gone === null) return false;
    setOnList((current) => ({ ...current, [item.id]: 0 }));
    router.refresh();
    return gone;
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
    (
      <SwipeToDismiss key={`${item.id}:${item.unit}`} label={words.stepper.remove} hint={view === "to-buy" && !hintShown && index === 0} onDismiss={() => takeOff(item)} className="rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-2 shadow-[var(--wh-shadow-card)]">
        {rowBody(item, "div")}
      </SwipeToDismiss>
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
      {/* The three summary cards are gone (the owner, 2026-11-20: crossed out);
          the tabs already count At home and To buy. Mark as bought had no
          other door, so it stays as one quiet button, on To buy only. */}
      {view === "to-buy" && canMarkBought && toBuyNow.length > 0 ? (
        <div className="flex justify-end">
          <MarkBoughtButton
            householdId={householdId}
            today={today}
            words={words}
            lines={boughtLines}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
              >
                <ShoppingCart aria-hidden className="size-4" />
                {words.bought.open}
              </button>
            )}
          />
        </div>
      ) : null}

      {/* Search and the sort share one row; the sort is picked, not typed
          (rule 20), on the OS's own picker (`Select`'s reasoning). The search
          takes the rest and may shrink, so a long sort label never overflows
          at 360px. */}
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
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
        <div className="relative shrink-0">
          <label htmlFor="grocery-sort" className="sr-only">
            {words.sort.label}
          </label>
          <ArrowDownUp
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]"
          />
          <select
            id="grocery-sort"
            value={sort}
            onChange={(event) => chooseSort(event.target.value as GrocerySort)}
            className="h-11 appearance-none rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-0 pr-3.5 pl-9 text-[0.8125rem] font-medium text-[var(--wh-foreground-muted)] shadow-[var(--wh-shadow-card)] focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
          >
            <option value="name">{words.sort.name}</option>
            <option value="recent">{words.sort.recent}</option>
          </select>
        </div>
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
        <ul className="flex flex-col gap-2">
          {shown.map((item, index) => row(item, index))}
        </ul>
      )}
    </div>
  );
}
