"use client";

import { Check, Search } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";

export type ChoiceListOption = {
  value: string;
  /** The name as its own speakers write it — "हिन्दी", not "Hindi". */
  label: string;
  /** One quiet line under it: a greeting, a time zone, a currency's name. */
  detail?: string;
  /** Extra words the search should match ("Hindi" for हिन्दी, "rupee" for INR). */
  keywords?: string;
  /** The option's own language and direction, so a screen reader pronounces it and Arabic reads right to left. */
  lang?: string;
  dir?: "ltr" | "rtl";
  /** A leading tile or badge. Never a flag standing in for a language. */
  leading?: ReactNode;
};

/**
 * One choice from a longer list, with a search above it (story 22-003: the
 * language, region and currency pickers). A real radio group under the
 * rows, so it posts without script and arrows move between options; the
 * search only hides rows, never the chosen one. Every row is a full-width,
 * comfortably tall target whose whole label wraps rather than clips (rules
 * 11 and 15).
 */
export function ChoiceList({
  name,
  legend,
  options,
  defaultValue,
  searchPlaceholder,
  emptyText,
  searchable = true,
  className,
}: {
  name: string;
  legend: string;
  options: readonly ChoiceListOption[];
  defaultValue?: string | null;
  searchPlaceholder?: string;
  emptyText: string;
  searchable?: boolean;
  className?: string;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(defaultValue ?? "");
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.value === chosen ||
        `${option.label} ${option.detail ?? ""} ${option.keywords ?? ""} ${option.value}`.toLocaleLowerCase().includes(needle),
    );
  }, [options, query, chosen]);

  return (
    <div className={cn("space-y-3", className)}>
      {searchable ? (
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {searchPlaceholder ?? legend}
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className="block min-h-11 w-full rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] ps-10 pe-4 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
          />
        </div>
      ) : null}
      <fieldset className="min-w-0">
        <legend className="sr-only">{legend}</legend>
        <div className="divide-y divide-[var(--wh-border)] overflow-hidden rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]">
          {shown.map((option) => {
            const selected = option.value === chosen;
            return (
              <label
                key={option.value}
                className={cn(
                  "relative flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors",
                  selected ? "bg-[var(--wh-primary-soft)]/60" : "hover:bg-[var(--wh-surface-muted)]",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={selected}
                  onChange={() => setChosen(option.value)}
                  className="peer sr-only"
                />
                {option.leading}
                <span className="min-w-0 flex-1" lang={option.lang} dir={option.dir}>
                  <span className="block font-medium">{option.label}</span>
                  {option.detail ? <span className="block text-sm text-[var(--wh-foreground-muted)]">{option.detail}</span> : null}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--wh-primary)]",
                    selected ? "border-[var(--wh-primary)] bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]" : "border-[var(--wh-border-strong)]",
                  )}
                >
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
              </label>
            );
          })}
          {shown.length === 0 ? <p className="px-4 py-4 text-sm text-[var(--wh-foreground-muted)]">{emptyText}</p> : null}
        </div>
      </fieldset>
    </div>
  );
}
