import {
  Briefcase,
  CalendarHeart,
  GraduationCap,
  HeartPulse,
  House,
  PartyPopper,
  User,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { CalendarCategory } from "../../calendar/projection";
import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * How a calendar category looks, everywhere it appears (story 12-009): its
 * icon tile, and the dot that stands for it in a month cell or a year day.
 * Each category keeps its domain's colour on the tile and the dot, never on
 * text (rule 3); the words beside it carry the meaning.
 */
export const CATEGORY_LOOK: Record<CalendarCategory, { icon: LucideIcon; tone: IconTone; dot: string }> = {
  family: { icon: CalendarHeart, tone: "people", dot: "var(--wh-tone-people)" },
  school: { icon: GraduationCap, tone: "school", dot: "var(--wh-tone-school)" },
  meals: { icon: Utensils, tone: "meals", dot: "var(--wh-tone-meals)" },
  health: { icon: HeartPulse, tone: "health", dot: "var(--wh-tone-health)" },
  personal: { icon: User, tone: "primary", dot: "var(--wh-primary)" },
  work: { icon: Briefcase, tone: "neutral", dot: "var(--wh-foreground-muted)" },
  household: { icon: House, tone: "home", dot: "var(--wh-tone-home)" },
  holiday: { icon: PartyPopper, tone: "care", dot: "var(--wh-tone-care)" },
};

export function CategoryDot({ category, className }: { category: CalendarCategory; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={{ background: CATEGORY_LOOK[category].dot }} />;
}

export type CalendarEntryRowProps = {
  title: string;
  category: CalendarCategory;
  /** "9:00 – 10:30 am", "All day". */
  when: string;
  /** Who it is about or who is going; null when it is nobody's in particular. */
  who: string | null;
  /** A place, or where a holiday's date comes from. */
  detail: string | null;
  /** Short words beside the title: "Proposed", "Repeats", "Just you". */
  badges?: readonly string[];
  /** A proposed plan is drawn with a dashed edge as well as said in words. */
  proposed?: boolean;
  /** The owning screen. A row with nowhere to go is not a link. */
  href: string | null;
};

/**
 * One calendar entry as a row (rule 4): tinted tile, the title in full (never
 * cut — rule 11), then when, who and where. It opens the record's own screen;
 * the calendar never edits a copy.
 */
export function CalendarEntryRow({ title, category, when, who, detail, badges = [], proposed = false, href }: CalendarEntryRowProps) {
  const look = CATEGORY_LOOK[category];
  const body = (
    <>
      <IconTile icon={look.icon} tone={look.tone} size="sm" />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium break-words">{title}</span>
          {badges.map((badge) => (
            <span key={badge} className="rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2 py-0.5 text-xs text-[var(--wh-foreground-muted)]">
              {badge}
            </span>
          ))}
        </span>
        <span className="block text-sm text-[var(--wh-foreground-muted)]">{[when, who].filter(Boolean).join(" · ")}</span>
        {detail ? <span className="block text-xs break-words text-[var(--wh-foreground-muted)]">{detail}</span> : null}
      </span>
    </>
  );
  const frame = cn(
    "flex min-h-14 items-start gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5",
    proposed && "border border-dashed border-[var(--wh-border-strong)]",
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(frame, "transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]")}>
          {body}
        </Link>
      ) : (
        <div className={frame}>{body}</div>
      )}
    </li>
  );
}
