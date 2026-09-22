"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A stat tile that opens in place onto the real entries behind its count
 * (design principle 21) instead of only linking away. The chevron points
 * down — "more, right here" — and turns to face up once opened, matching
 * `ExpandableRow`'s convention elsewhere in the kit.
 *
 * `details` is real, already-computed content (a short list, an empty-state
 * line) — this component never invents what is behind a number (rule 9),
 * only reveals it. `icon` is a pre-rendered `IconTile` element, not a
 * component reference — this file is a Client Component (it owns open/close
 * state), and a lucide icon function can't cross the server/client boundary
 * as a raw prop value, only an already-rendered element can.
 */
export type ExpandableMetric = {
  label: string;
  value: number | string;
  icon: ReactNode;
  details: ReactNode;
};

function ExpandableMetricCard({ label, value, icon, details }: ExpandableMetric) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="overflow-hidden rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-[var(--wh-primary-soft)]/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-semibold leading-none tracking-tight">{value}</span>
          <span className="mt-1 block text-[0.6875rem] font-medium text-[var(--wh-foreground-muted)]">
            {label}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      {/* Animated with a pure-CSS grid-rows trick rather than a JS height
          measurement, so it keeps working however long `details` turns out
          to be. `inert` (not just visual hiding) keeps a closed panel's own
          links out of the tab order — closed has to mean closed. */}
      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="border-t border-[var(--wh-border)] px-3.5 py-3">{details}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Same responsive shape as `MetricGrid` (rule 19's two-per-row exception is
 * still opt-in via `pairs`, for short one-word labels only): full-width rows
 * on a phone by default, widening once there is real room for every label.
 */
export function ExpandableMetricGrid({
  metrics,
  pairs = false,
  className,
}: {
  metrics: readonly ExpandableMetric[];
  pairs?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid gap-2.5",
        pairs ? "grid-cols-2" : "grid-cols-1",
        metrics.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
        className,
      )}
    >
      {metrics.map((metric) => (
        <li key={metric.label} className="min-w-0">
          <ExpandableMetricCard {...metric} />
        </li>
      ))}
    </ul>
  );
}

/** An open metric panel's own list of real entries, one compact row each. */
export function MetricDetailList({ children }: { children: ReactNode }) {
  return <ul className="space-y-2.5">{children}</ul>;
}

export function MetricDetailRow({
  icon,
  title,
  meta,
  badge,
}: {
  /** A pre-rendered `IconTile` element — see the note on `ExpandableMetric.icon`. */
  icon: ReactNode;
  title: string;
  meta?: string | null;
  /** A short state word beside the row — a due date, a count, a status. */
  badge?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{title}</span>
        {meta ? <span className="block text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{meta}</span> : null}
      </span>
      {badge ? <span className="shrink-0">{badge}</span> : null}
    </li>
  );
}

/** The panel's own empty state — nothing behind the count worth listing (rule 9: never invented). */
export function MetricDetailEmpty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-[var(--wh-foreground-muted)]">{children}</p>;
}
