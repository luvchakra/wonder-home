import Link from "next/link";

import type { CalendarCategory } from "../../calendar/projection";
import { cn } from "../../lib/cn";
import { CategoryDot } from "./calendar-entry";

export type MonthCell = {
  key: string;
  /** The day number as the person's locale writes it. */
  label: string;
  href: string;
  /** "Tuesday 20 October, 2 things on" — the whole cell, for a screen reader. */
  ariaLabel: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /** Up to three categories, in the day's order, drawn as dots on a phone. */
  dots: readonly CalendarCategory[];
  /** Titles drawn in the cell from `sm` up, two at most. */
  titles: readonly { title: string; category: CalendarCategory; proposed: boolean }[];
  /** "+2" beyond the dots; "+2 more" beyond the titles. */
  moreShort: string | null;
  moreLong: string | null;
};

/**
 * A month as a 7-column grid (story 12-009, design §4 "Month"). On a phone a
 * cell holds the date and up to three category dots, so 7 columns fit at
 * 360px without cutting anything; from `sm` up it shows two titles and
 * "+N more". Every cell is a link to that day, so the grid works with no
 * script, by keyboard and by screen reader.
 */
export function CalendarMonthGrid({ weekdays, cells, label }: { weekdays: readonly string[]; cells: readonly MonthCell[]; label: string }) {
  return (
    <div role="grid" aria-label={label} className="select-none">
      <div role="row" className="grid grid-cols-7 gap-1 pb-1">
        {weekdays.map((weekday) => (
          <span key={weekday} role="columnheader" className="text-center text-xs font-medium text-[var(--wh-foreground-muted)]">
            {weekday}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <div key={cell.key} role="gridcell" aria-selected={cell.isSelected}>
            <Link
              href={cell.href}
              aria-label={cell.ariaLabel}
              aria-current={cell.isToday ? "date" : undefined}
              scroll={false}
              className={cn(
                "flex min-h-14 flex-col items-center gap-1 rounded-[var(--wh-radius-sm)] px-0.5 py-1.5 transition-colors sm:min-h-24 sm:items-stretch sm:px-1.5",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]",
                cell.isSelected ? "bg-[var(--wh-primary-soft)]" : "hover:bg-[var(--wh-surface-muted)]",
                !cell.inMonth && "opacity-45",
              )}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-sm tabular-nums sm:self-start",
                  cell.isToday && "bg-[var(--wh-primary)] font-semibold text-[var(--wh-primary-foreground)]",
                  cell.isSelected && !cell.isToday && "font-semibold text-[var(--wh-primary)]",
                )}
              >
                {cell.label}
              </span>
              <span aria-hidden className="flex items-center gap-0.5 sm:hidden">
                {cell.dots.map((category, index) => (
                  <CategoryDot key={`${category}-${index}`} category={category} />
                ))}
                {cell.moreShort ? <span className="text-[0.625rem] leading-none text-[var(--wh-foreground-muted)]">{cell.moreShort}</span> : null}
              </span>
              <span aria-hidden className="hidden w-full space-y-0.5 sm:block">
                {cell.titles.map((item, index) => (
                  <span
                    key={`${item.title}-${index}`}
                    className={cn(
                      "flex items-start gap-1 rounded-[0.375rem] px-1 py-0.5 text-[0.6875rem] leading-tight break-words",
                      item.proposed ? "border border-dashed border-[var(--wh-border-strong)]" : "bg-[var(--wh-surface-muted)]",
                    )}
                  >
                    <CategoryDot category={item.category} className="mt-1" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{item.title}</span>
                  </span>
                ))}
                {cell.moreLong ? <span className="block px-1 text-[0.6875rem] text-[var(--wh-foreground-muted)]">{cell.moreLong}</span> : null}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}


