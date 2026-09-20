import Link from "next/link";
import { cn } from "../../lib/cn";
import { Avatar, cardTintFor } from "./avatar";

/**
 * A member of the household on the Family screen: avatar, name, role, and the
 * one line that says what they are carrying right now.
 *
 * The card itself carries the same tint the avatar does — the same "one
 * person, one colour, everywhere" rule `Avatar` already keeps, just spread
 * across the whole card instead of only the circle.
 */
export type PersonCardProps = {
  name: string;
  role: string;
  /** "Invited", "On leave" — absent when nothing is on. "You" gets its own look. */
  now?: string | null;
  href?: string;
  badge?: string;
  className?: string;
};

export function PersonCard({ name, role, now, href, badge, className }: PersonCardProps) {
  const isYou = now === "You";
  const inner = (
    <>
      <Avatar name={name} size="lg" badge={badge} />
      <span className="mt-2 block text-sm font-semibold">{name}</span>
      <span className="block text-[0.6875rem] text-[var(--wh-foreground-muted)]">{role}</span>
      {now ? (
        <span
          className={cn(
            "mt-1.5 inline-block rounded-[var(--wh-radius-pill)] px-2.5 py-0.5 text-[0.6875rem] font-semibold",
            isYou ? "bg-[var(--wh-surface)] text-[var(--wh-primary)]" : "bg-[var(--wh-surface)]/80 text-[var(--wh-foreground-muted)]",
          )}
        >
          {now}
        </span>
      ) : null}
    </>
  );

  const base = cn(
    "flex min-w-0 flex-col items-center rounded-[var(--wh-radius)] px-3 py-4 text-center",
    cardTintFor(name),
    className,
  );

  return href ? (
    <Link href={href} className={cn(base, "wh-lift")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}
