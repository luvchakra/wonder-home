import Link from "next/link";

import type { CalendarCategory } from "../../calendar/projection";
import { cn } from "../../lib/cn";
import { CATEGORY_LOOK } from "./calendar-entry";

export type DayBlock = {
  key: string;
  title: string;
  /** "9:00 – 10:30", or "from 8:00 pm" when it started the day before. */
  when: string;
  who: string | null;
  category: CalendarCategory;
  proposed: boolean;
  href: string | null;
  /** Minutes from the grid's first hour, and minutes tall. */
  top: number;
  height: number;
  column: number;
  columns: number;
};

/** Pixels per hour: tall enough that a half-hour block holds a title and its time. */
const HOUR_PX = 56;

/**
 * A day as a time grid (story 12-009, design §4 "Day"): hour lines down the
 * side, and each timed entry a tinted card placed by its time, overlapping
 * ones side by side. Titles wrap inside their card rather than being cut
 * (rule 15): every card is at least half an hour tall, and one whose words
 * still do not fit grows to its full height on hover or keyboard focus.
 */
export function CalendarDayGrid({
  hours,
  blocks,
  compact = false,
  nowTop,
  label,
}: {
  /** One label per hour line, first to last. */
  hours: readonly string[];
  blocks: readonly DayBlock[];
  /** For a week's column: no hour labels, smaller words. */
  compact?: boolean;
  /** Minutes from the first hour to now, when now is on this grid. */
  nowTop?: number | null;
  label: string;
}) {
  const scale = HOUR_PX / 60;
  return (
    <div aria-label={label} role="group" className="relative" style={{ height: (hours.length - 1) * HOUR_PX + 8 }}>
      {hours.map((hour, index) => (
        <div key={`${hour}-${index}`} aria-hidden className="absolute inset-x-0 flex items-start gap-2" style={{ top: index * HOUR_PX }}>
          {compact ? null : <span className="-mt-2 w-12 shrink-0 text-right text-[0.6875rem] text-[var(--wh-foreground-muted)] tabular-nums">{hour}</span>}
          <span className="mt-px h-px flex-1 bg-[var(--wh-border)]" />
        </div>
      ))}
      {nowTop != null ? (
        <span aria-hidden className={cn("absolute right-0 h-0.5 rounded bg-[var(--wh-primary)]", compact ? "left-0" : "left-14")} style={{ top: nowTop * scale }} />
      ) : null}
      <ul className={cn("absolute inset-y-0 right-0", compact ? "left-0" : "left-14")}>
        {blocks.map((block) => {
          const look = CATEGORY_LOOK[block.category];
          const width = 100 / block.columns;
          const card = (
            <>
              <span className="block font-medium [overflow-wrap:anywhere]">{block.title}</span>
              <span className="block text-[var(--wh-foreground-muted)]">{[block.when, compact ? null : block.who].filter(Boolean).join(" · ")}</span>
            </>
          );
          const frame = cn(
            "absolute overflow-hidden rounded-[var(--wh-radius-sm)] border-l-4 px-2 py-1 leading-snug shadow-[var(--wh-shadow-card)]",
            compact ? "text-[0.6875rem]" : "text-xs sm:text-sm",
            block.proposed ? "border border-dashed bg-[var(--wh-surface)]" : "bg-[var(--wh-surface)]",
          );
          const style = {
            top: block.top * scale + 1,
            height: Math.max(block.height * scale - 2, 26),
            left: `calc(${block.column * width}% + 2px)`,
            width: `calc(${width}% - 4px)`,
            borderLeftColor: look.dot,
          };
          return (
            <li key={block.key}>
              {block.href ? (
                <Link href={block.href} className={cn(frame, "hover:z-10 hover:h-auto! hover:min-h-fit focus-visible:z-10 focus-visible:h-auto! focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]")} style={style}>
                  {card}
                </Link>
              ) : (
                <div className={frame} style={style}>
                  {card}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type WeekStripDay = { key: string; weekday: string; label: string; href: string; ariaLabel: string; isToday: boolean; isSelected: boolean; busy: boolean };

/** The seven days around the one shown, each a link; the selected one filled, today ringed. */
export function CalendarWeekStrip({ days, label }: { days: readonly WeekStripDay[]; label: string }) {
  return (
    <nav aria-label={label} className="grid grid-cols-7 gap-1">
      {days.map((day) => (
        <Link
          key={day.key}
          href={day.href}
          aria-label={day.ariaLabel}
          aria-current={day.isSelected ? "date" : undefined}
          scroll={false}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[var(--wh-radius-sm)] text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]",
            day.isSelected ? "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]" : "hover:bg-[var(--wh-surface-muted)]",
            day.isToday && !day.isSelected && "ring-2 ring-[var(--wh-primary)] ring-inset",
          )}
        >
          <span className={cn("text-[0.6875rem]", day.isSelected ? "" : "text-[var(--wh-foreground-muted)]")}>{day.weekday}</span>
          <span className="font-semibold tabular-nums">{day.label}</span>
          <span aria-hidden className={cn("size-1 rounded-full", day.busy ? (day.isSelected ? "bg-[var(--wh-primary-foreground)]" : "bg-[var(--wh-primary)]") : "bg-transparent")} />
        </Link>
      ))}
    </nav>
  );
}
