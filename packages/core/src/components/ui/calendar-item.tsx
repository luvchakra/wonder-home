import { CalendarClock, CalendarDays, Cake, ChevronRight, Gift, GraduationCap, Heart, PartyPopper, Plane, Users } from "lucide-react";
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
  /** The kind's tile beside the date; off where a heading already says the kind. */
  showKind?: boolean;
  /** Who is going, in words ("With Asmi"), under when. */
  people?: string | null;
  /** Where, under when. */
  place?: string | null;
};

/** The tile a kind of event wears, shared by every event row. */
export function calendarKindLook(kind?: string): { icon: ComponentType<{ className?: string }>; tone: IconTone } {
  return (kind && KIND_ICON[kind]) || { icon: CalendarDays, tone: "primary" };
}

const KIND_ICON: Record<string, { icon: ComponentType<{ className?: string }>; tone: IconTone }> = {
  birthday: { icon: Cake, tone: "people" },
  gift: { icon: Gift, tone: "people" },
  outing: { icon: PartyPopper, tone: "care" },
  travel: { icon: Plane, tone: "home" },
  visit: { icon: Users, tone: "people" },
  family_time: { icon: Heart, tone: "people" },
  special_occasion: { icon: Gift, tone: "people" },
  gathering: { icon: Users, tone: "people" },
  // The calendar's own look for these (`CATEGORY_LOOK`): school is school's tile, never a family heart.
  school_event: { icon: GraduationCap, tone: "school" },
  appointment: { icon: CalendarClock, tone: "primary" },
};

export function CalendarItem({ title, when, kind, protectedTime, day, month, action, className, protectedLabel = "Protected", href, showKind = true, people, place }: CalendarItemProps) {
  const presentation = calendarKindLook(kind);

  const body = (
    <>
      {/* The date leaf with the kind's tile tucked under it, one narrow column,
          so the title, time and place get the row's width (the owner, 2026-10-18). */}
      <span className={cn("relative w-12 shrink-0 self-start", showKind && "pb-3")}>
        <span
          aria-hidden
          className="grid w-12 place-items-center rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1 leading-none"
        >
          <span className="text-[0.5625rem] font-bold tracking-wider text-[var(--wh-tone-people)] uppercase">{month}</span>
          <span className="text-lg font-bold tabular-nums">{day}</span>
        </span>
        {showKind ? (
          <IconTile
            icon={presentation.icon}
            tone={presentation.tone}
            size="sm"
            className="absolute bottom-0 left-1/2 size-6 -translate-x-1/2 rounded-full ring-2 ring-[var(--wh-surface)] [&>svg]:size-3.5"
          />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        {/* The badge wraps under the title when the row is narrow, never under the action (rule 15). */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium">
          <span className="min-w-0">{title}</span>
          {protectedTime ? (
            <span className="shrink-0 rounded-[var(--wh-radius-pill)] bg-[var(--wh-tone-people-soft)] px-1.5 py-0.5 text-[0.625rem] font-semibold whitespace-nowrap text-[var(--wh-tone-people)]">
              {protectedLabel}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">{when}</p>
        {place ? <p className="text-xs [overflow-wrap:anywhere] text-[var(--wh-foreground-subtle)]">{place}</p> : null}
        {people ? <p className="text-xs text-[var(--wh-foreground-muted)]">{people}</p> : null}
      </div>
      {href ? <ChevronRight aria-hidden className="size-4 shrink-0 self-center text-[var(--wh-foreground-subtle)]" /> : null}
    </>
  );

  return (
    <li className={cn("flex items-center gap-3 py-3", className)}>
      {href ? (
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-[var(--wh-radius-sm)] transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
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
