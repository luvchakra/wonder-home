import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * The small numbers under a greeting — "3 need attention", "12 in progress".
 *
 * Every metric is a real count of something the system actually evaluated. A
 * number nobody can explain is worse than no number, so this component takes
 * values and never invents one.
 */
export type Metric = {
  label: string;
  value: number | string;
  icon?: ComponentType<{ className?: string }>;
  tone?: IconTone;
  /** Where tapping the metric goes, when it goes anywhere. */
  href?: string;
};

export function MetricCard({ label, value, icon, tone = "primary", href, stacked = false }: Metric & { stacked?: boolean }) {
  const body = stacked ? (
    <>
      {icon ? <IconTile icon={icon} tone={tone} size="sm" /> : null}
      <span className="block text-xl font-semibold leading-none tracking-tight">{value}</span>
      <span className="block text-[0.6875rem] font-medium break-words text-[var(--wh-foreground-muted)]">{label}</span>
    </>
  ) : (
    <>
      {icon ? <IconTile icon={icon} tone={tone} size="sm" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-semibold leading-none tracking-tight">{value}</span>
        <span className="mt-1 block text-[0.6875rem] font-medium text-[var(--wh-foreground-muted)]">
          {label}
        </span>
      </span>
      {/* A card that goes somewhere says so. Without the chevron these read
          as read-only counts, and nobody discovers they are a way in. */}
      {href ? <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" /> : null}
    </>
  );

  const className = cn(
    stacked ? "flex h-full flex-col items-start gap-1.5" : "flex items-center gap-2.5",
    "rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3.5 py-3 shadow-[var(--wh-shadow-card)]",
  );

  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "wh-lift transition-colors hover:border-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]/30",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * A card never gets narrower than its label needs (design principles 18 and
 * 19): on a phone that means one full-width row per metric, not three or
 * four squeezed into a row that then has to truncate. Widens into the
 * original multi-column grid once there is room for it at `sm` and up.
 *
 * `pairs` allows the one exception rule 19 permits — two to a row on a
 * phone, never three — and is for short labels only, the one-word kind a
 * caller has checked fits at half width. It is opt-in precisely so that
 * adding a longer label somewhere else cannot quietly re-create the
 * truncation this layout exists to prevent.
 *
 * `row` is the owner's other exception (rule 19): three short counts side
 * by side on a phone as stacked tiles — icon, number, then a label that
 * wraps rather than being cut. Groceries' To buy counts use it (2026-10-20).
 */
export function MetricGrid({
  metrics,
  pairs = false,
  row = false,
  className,
}: {
  metrics: readonly Metric[];
  pairs?: boolean;
  row?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid gap-2.5",
        row ? "grid-cols-3" : pairs ? "grid-cols-2" : "grid-cols-1",
        row ? null : metrics.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
        className,
      )}
    >
      {metrics.map((metric) => (
        <li key={metric.label} className="min-w-0">
          <MetricCard {...metric} stacked={row} />
        </li>
      ))}
    </ul>
  );
}
