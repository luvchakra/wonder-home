"use client";

import { Check, Plus, ShoppingBasket } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "../../lib/cn";
import type { IngredientChoice, IngredientSearch, IngredientSearchLabels } from "./ingredient-rows";

const INPUT =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]";

/**
 * An item picked from the grocery catalog (25-017, the owner 2026-10-18:
 * ingredients "should be from the same grocery catalog that is used in
 * HomeFood"). As the person types, the household's own items and then the
 * shared catalog Add item searches are offered under the field, each with
 * its picture and brand; a pick links the row to that item. A name the
 * catalog does not have is still one tap away — "Use “…” as a new item" —
 * so nobody is stuck with the closest wrong choice (rule 20).
 *
 * A combobox in the ARIA sense: the list is announced, arrows move through
 * it, Enter picks, Escape closes. Names wrap, never cut (rule 11).
 */
export function CatalogItemField({
  id,
  name,
  value,
  linked,
  onType,
  onPick,
  search,
  labels,
  placeholder,
}: {
  id: string;
  name: string;
  value: string;
  /** The row is already linked to an item: the field says so with a tick. */
  linked: boolean;
  onType: (value: string) => void;
  onPick: (choice: IngredientChoice) => void;
  search: IngredientSearch;
  labels: IngredientSearchLabels;
  placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ query: string; choices: IngredientChoice[] } | null>(null);
  const [active, setActive] = useState(-1);
  const needle = value.trim();
  // The caller's search is a new function each render; the latest one is used, without searching again because of it.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });

  // Asked a moment after the person pauses, never for one letter, never after a pick.
  useEffect(() => {
    if (!open || linked || needle.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      searchRef.current(needle)
        .then((result) => live && setFound({ query: needle, choices: result.ok ? result.choices : [] }))
        .catch(() => live && setFound({ query: needle, choices: [] }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [needle, open, linked]);

  const showing = open && !linked && needle.length >= 2;
  const choices = found?.query === needle ? found.choices : [];
  const searching = showing && found?.query !== needle;
  // The last option is always the typed name itself, unless a choice already is it.
  const typedIsChoice = choices.some((choice) => choice.name.toLowerCase() === needle.toLowerCase());
  const options = showing ? [...choices, ...(typedIsChoice ? [] : [null])] : [];

  const choose = (index: number) => {
    const option = options[index];
    if (option) onPick(option);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={id}
          name={name}
          value={value}
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            onType(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          // A tap on an option lands before the blur closes the list (each option prevents the blur itself).
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (!showing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, options.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && active >= 0) {
              event.preventDefault();
              choose(active);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={120}
          className={cn(INPUT, linked && "pe-10")}
        />
        {linked ? <Check aria-hidden className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[var(--wh-handled)]" /> : null}
      </div>
      {showing ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1 shadow-[var(--wh-shadow-card)]"
        >
          {searching && choices.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--wh-foreground-muted)]" role="status">
              {labels.searching}
            </li>
          ) : null}
          {options.map((option, index) => (
            <li
              key={option?.ref ?? "typed"}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 py-1.5 text-sm",
                active === index ? "bg-[var(--wh-surface-muted)]" : "hover:bg-[var(--wh-surface-muted)]",
              )}
            >
              {option ? (
                <>
                  {option.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a catalog picture from storage, already sized
                    <img src={option.imageUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-muted)]">
                      <ShoppingBasket className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{option.name}</span>
                    {option.detail || option.own ? (
                      <span className="block text-xs text-[var(--wh-foreground-muted)]">{[option.own ? labels.atHome : null, option.detail].filter(Boolean).join(" · ")}</span>
                    ) : null}
                  </span>
                </>
              ) : (
                <>
                  <Plus aria-hidden className="size-4 shrink-0 text-[var(--wh-primary)]" />
                  <span className="min-w-0 flex-1 font-medium text-[var(--wh-primary)]">{labels.useTyped.replace("{name}", needle)}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
