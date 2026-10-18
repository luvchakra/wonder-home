"use client";

import { Search, ShoppingBasket } from "lucide-react";
import { useMemo, useState } from "react";

import {
  GroceryRow,
  type GroceryStatus,
} from "@wonderhome/core/ui/grocery-row";
import { EmptyState } from "@wonderhome/core/ui/states";
import type { Ladder } from "@wonderhome/core/commerce/buying-sizes";

import type { GroceryWords } from "../../_lib/grocery-words";
import { fill } from "./amounts";
import { MarkBoughtButton } from "./mark-bought";
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
  status: GroceryStatus;
  stockText: string;
  toBuy: { entryId: string; quantity: number; unit: string } | null;
};

/**
 * The one Groceries list (design §3.1): search, a category filter and a
 * row per item with what is at home and what to buy side by side. "To buy"
 * is the same rows, narrowed to what is on the list and grouped by
 * category, with "Mark as bought" — never a second source of truth.
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
  canMarkBought: boolean;
  /** The household's own date, for "Bought on". */
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
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
      (view === "all" || item.toBuy !== null) &&
      (!category || item.category === category) &&
      (!needle ||
        [item.name, item.category, ...item.aliases].some((text) =>
          text.toLowerCase().includes(needle),
        )),
  );

  const groups =
    view === "to-buy"
      ? categories
          .map((name) => ({
            name,
            rows: shown.filter((item) => item.category === name),
          }))
          .filter((group) => group.rows.length > 0)
      : [{ name: "", rows: shown }];
  const toBuyNow = items.filter(
    (item) => item.toBuy && (onList[item.id] ?? 0) > 0,
  );

  const row = (item: ListItem) => (
    <GroceryRow
      key={item.id}
      name={item.name}
      category={item.category}
      href={`/groceries/${item.id}`}
      imageUrl={item.imageUrl}
      status={item.status}
      statusLabel={words.status[item.status]}
      stockLabel={words.inStock}
      stockText={item.stockText}
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
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
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

      {view === "to-buy" && canMarkBought && toBuyNow.length > 0 ? (
        <MarkBoughtButton
          householdId={householdId}
          today={today}
          words={words}
          lines={toBuyNow.map((item) => ({
            entryId: item.toBuy!.entryId,
            itemId: item.id,
            name: item.name,
            unit: item.unit,
            quantity: onList[item.id] ?? item.toBuy!.quantity,
            baseUnit: item.toBuy!.unit,
          }))}
        />
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
        groups.map((group) => (
          <section
            key={group.name || "all"}
            aria-label={group.name || undefined}
            className="space-y-1"
          >
            {group.name ? (
              <h3 className="px-1 pt-1 text-sm font-semibold text-[var(--wh-foreground-muted)] first-letter:uppercase">
                {group.name}
              </h3>
            ) : null}
            <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-2 shadow-[var(--wh-shadow-card)]">
              {group.rows.map(row)}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
