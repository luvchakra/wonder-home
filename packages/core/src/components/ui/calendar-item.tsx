import { CalendarDays, Cake, ChevronRight, Gift, Heart, PartyPopper, Plane, Users } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * An upcoming event: the date as a small calendar leaf, then what and when.
 */
export type CalendarItemProps = {
  title: string;
  /** e.g. "Fri, 19 Sep 2026 · 3:00 – 7:00 PM" */
  when: string;
  kind?: string;
  protectedTime?: boolean;
  /** Day-of-month and short month for the leaf. */
  day: string;
  month: string;
  action?: ReactNode;
  className?: string;
  /** The "Protected" badge in the viewer's language; English by default. */
  protectedLabel?: string;
  /** Where the event opens to its full detail. The row becomes a link with a chevron; its action stays its own button. */
  href?: string;
};

const KIND_ICON: Record<string, { icon: ComponentType<{ className?: string }>; tone: IconTone }> = {
  birthday: { icon: Cake, tone: "people" },
  gift: { icon: Gift, tone: "people" },
  outing: { icon: PartyPopper, tone: "care" },
  travel: { icon: Plane, tone: "home" },
  visit: { icon: Users, tone: "people" },
  family_time: { icon: Heart, tone: "people" },
  special_occasion: { icon: Gift, tone: "people" },
};

export function CalendarItem({ title, when, kind, protectedTime, day, month, action, className, protectedLabel = "Protected", href }: CalendarItemProps) {
  const presentation = (kind && KIND_ICON[kind]) || { icon: CalendarDays, tone: "primary" as IconTone };

  const body = (
    <>
      <span
        aria-hidden
        className="grid w-12 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1 leading-none"
      >
        <span className="text-[0.5625rem] font-bold tracking-wider text-[var(--wh-tone-people)] uppercase">{month}</span>
        <span className="text-lg font-bold tabular-nums">{day}</span>
      </span>
      <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {title}
          {protectedTime ? (
            <span className="ml-1.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-tone-people-soft)] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[var(--wh-tone-people)]">
              {protectedLabel}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">{when}</p>
      </div>
      {href ? <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" /> : null}
    </>
  );

  return (
    <li className={cn("flex items-center gap-3 py-3", className)}>
      {href ? (
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--wh-radius-sm)] transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          {body}
        </Link>
      ) : (
        body
      )}
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}
