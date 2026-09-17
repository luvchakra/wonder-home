import { RefreshCw } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { ButtonLink } from "./button";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * The three states every data-driven screen must have (requirements §49).
 *
 * Empty explains what happens next rather than saying "no data". Error is
 * human-readable and offers a way forward; the raw failure never reaches the
 * page. Loading is a skeleton in the shape of the content it stands in for.
 */
export type EmptyStateProps = {
  icon: ComponentType<{ className?: string }>;
  tone?: IconTone;
  title: string;
  /** What WonderHome will do, or what the person can do, next. */
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, tone = "primary", title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[var(--wh-radius)] border border-dashed border-[var(--wh-border-strong)] bg-[var(--wh-surface)]/60 px-5 py-8 text-center",
        className,
      )}
    >
      <IconTile icon={icon} tone={tone} size="lg" />
      <h2 className="mt-3 text-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--wh-foreground-muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something did not load",
  description = "Nothing has been changed. Try again in a moment.",
  retryHref,
  className,
}: {
  title?: string;
  description?: string;
  retryHref?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-[var(--wh-radius)] border border-[var(--wh-risk-soft)] bg-[var(--wh-risk-soft)]/60 px-5 py-8 text-center",
        className,
      )}
    >
      <IconTile icon={RefreshCw} tone="risk" size="lg" />
      <h2 className="mt-3 text-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--wh-foreground-muted)]">{description}</p>
      {retryHref ? (
        <ButtonLink href={retryHref} variant="secondary" className="mt-4">
          Try again
        </ButtonLink>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("wh-skeleton block", className)} />;
}

/** A skeleton in the shape of a list of rows, for a screen still loading. */
export function LoadingState({ rows = 3, label = "Loading", className }: { rows?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className={cn("space-y-3", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3"
        >
          <Skeleton className="size-10 rounded-[var(--wh-radius-sm)]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-16 rounded-[var(--wh-radius-pill)]" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}
