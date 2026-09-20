import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * A household domain as a tile: "Meals & Recipes — Healthy meals. Happier
 * moods." Used by More, by the landing page's feature grid and by the family
 * responsibilities overview, so the same domain always looks the same.
 */
export type DomainCardProps = {
  href?: string;
  icon: ComponentType<{ className?: string }>;
  tone: IconTone;
  title: string;
  description: string;
  /** A small count or state, e.g. "3 active". */
  meta?: string;
  className?: string;
};

export function DomainCard({ href, icon, tone, title, description, meta, className }: DomainCardProps) {
  const inner = (
    <>
      <span className="flex items-start justify-between gap-2">
        <IconTile icon={icon} tone={tone} size="lg" />
        {href ? (
          <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
        ) : null}
      </span>
      <span className="mt-3 block text-sm font-semibold tracking-tight">{title}</span>
      <span className="mt-0.5 block text-xs leading-snug text-[var(--wh-foreground-muted)]">
        {description}
      </span>
      {meta ? (
        <span className="mt-2 block text-[0.6875rem] font-medium text-[var(--wh-primary)]">{meta}</span>
      ) : null}
    </>
  );

  const base = cn(
    "block rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 text-left shadow-[var(--wh-shadow-card)]",
    className,
  );

  return href ? (
    <Link
      href={href}
      className={cn(
        base,
        "wh-lift transition-colors hover:border-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]/30",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
      )}
    >
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

export function DomainGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)}>{children}</div>;
}
