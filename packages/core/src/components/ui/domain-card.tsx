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
      <IconTile icon={icon} tone={tone} size="lg" />
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
    <a href={href} className={cn(base, "wh-lift")}>
      {inner}
    </a>
  ) : (
    <div className={base}>{inner}</div>
  );
}

export function DomainGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)}>{children}</div>;
}
