import Link from "next/link";

import { cn } from "../../lib/cn";

export type YearDay = { key: string; label: string; href: string; ariaLabel: string; level: 0 | 1 | 2 | 3; isToday: boolean };

export type YearMonth = {
  key: string;
  name: string;
  href: string;
  ariaLabel: string;
  /** 42 slots, null where the grid has no day of this month. */
  days: readonly (YearDay | null)[];
};

const LEVEL = ["", "bg-[var(--wh-primary-soft)]", "bg-[color-mix(in_oklch,var(--wh-primary)_30%,var(--wh-surface))]", "bg-[color-mix(in_oklch,var(--wh-primary)_55%,var(--wh-surface))] text-[var(--wh-primary-foreground)]"];

/**
 * A year as twelve small months (story 12-009, design §4 "Year"): two to a
 * row on a phone (rule 19), more from `md` up. A day is tinted by how much is
 * on it — a count, never a title — and the words "A darker day has more on"
 * sit beside it, so the tint is never the only signal (rule 3). The month's
 * name opens Month; a day opens Day.
 */
export function CalendarYear({
  months,
  weekdays,
  legend,
}: {
  months: readonly YearMonth[];
  /** Narrow weekday names ("M", "T"), as Intl writes them for the person's language. */
  weekdays: readonly string[];
  legend: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--wh-foreground-muted)]">{legend}</p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <li key={month.key} className="rounded-[var(--wh-radius)] bg-[var(--wh-surface)] p-2.5 shadow-[var(--wh-shadow-card)]">
            <Link href={month.href} aria-label={month.ariaLabel} className="mb-1.5 block rounded-[var(--wh-radius-sm)] px-1 text-sm font-semibold hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
              {month.name}
            </Link>
            <div aria-hidden className="grid grid-cols-7 text-center text-[0.5625rem] text-[var(--wh-foreground-muted)]">
              {weekdays.map((weekday, index) => (
                <span key={`${weekday}-${index}`}>{weekday}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {month.days.map((day, index) =>
                day ? (
                  <Link
                    key={day.key}
                    href={day.href}
                    aria-label={day.ariaLabel}
                    aria-current={day.isToday ? "date" : undefined}
                    className={cn(
                      "grid aspect-square min-h-5 place-items-center rounded-[0.3rem] text-[0.625rem] tabular-nums focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]",
                      LEVEL[day.level],
                      day.isToday && "ring-1 ring-[var(--wh-primary)]",
                    )}
                  >
                    {day.label}
                  </Link>
                ) : (
                  <span key={`blank-${index}`} aria-hidden />
                ),
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
