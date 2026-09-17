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

export function MetricCard({ label, value, icon, tone = "primary", href }: Metric) {
  const body = (
    <>
      {icon ? <IconTile icon={icon} tone={tone} size="sm" /> : null}
      <span className="min-w-0">
        <span className="block text-xl font-semibold leading-none tracking-tight">{value}</span>
        <span className="mt-1 block truncate text-[0.6875rem] font-medium text-[var(--wh-foreground-muted)]">
          {label}
        </span>
      </span>
    </>
  );

  const className =
    "flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3.5 py-3 shadow-[var(--wh-shadow-card)]";

  return href ? (
    <Link href={href} className={cn(className, "wh-lift")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function MetricGrid({ metrics, className }: { metrics: readonly Metric[]; className?: string }) {
  return (
    <ul
      className={cn(
        "grid gap-2.5",
        metrics.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
        className,
      )}
    >
      {metrics.map((metric) => (
        <li key={metric.label} className="min-w-0">
          <MetricCard {...metric} />
        </li>
      ))}
    </ul>
  );
}
