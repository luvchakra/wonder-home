import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * The row the whole product is made of: what it is, why it matters, and the one
 * thing to do about it.
 *
 * The action sits on the row rather than behind a tap-through, because the
 * mockups' promise is that a household can clear its attention list from the
 * home screen. A row with nothing to do about it simply has no action, and that
 * is a meaningful state rather than a missing button.
 */
export type ActionRowProps = {
  icon: ComponentType<{ className?: string }>;
  tone?: IconTone;
  title: string;
  /** One line of context: why this is here, in the household's words. */
  meta?: string;
  /** The single thing to do. Usually a `Pill`. */
  action?: ReactNode;
  className?: string;
};

export function ActionRow({ icon, tone = "primary", title, meta, action, className }: ActionRowProps) {
  return (
    <li className={cn("flex items-center gap-3 py-3", className)}>
      <IconTile icon={icon} tone={tone} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {meta ? (
          <p className="truncate text-xs text-[var(--wh-foreground-subtle)]">{meta}</p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

/** The same row when it is a link rather than an action: chevron, no button. */
export function NavRow({
  icon,
  tone = "primary",
  title,
  meta,
  href,
}: Omit<ActionRowProps, "action"> & { href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-1 py-2 transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <IconTile icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {meta ? (
            <span className="block truncate text-xs text-[var(--wh-foreground-subtle)]">{meta}</span>
          ) : null}
        </span>
        <span aria-hidden className="shrink-0 text-[var(--wh-foreground-subtle)]">
          ›
        </span>
      </Link>
    </li>
  );
}
