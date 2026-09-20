import Link from "next/link";
import { cn } from "../../lib/cn";
import { Avatar } from "./avatar";

/**
 * A member of the household on the Family screen: avatar, name, role, and the
 * one line that says what they are carrying right now.
 */
export type PersonCardProps = {
  name: string;
  role: string;
  /** "School project", "On leave", "Vet appointment". Absent when nothing is on. */
  now?: string | null;
  href?: string;
  badge?: string;
  className?: string;
};

export function PersonCard({ name, role, now, href, badge, className }: PersonCardProps) {
  const inner = (
    <>
      <Avatar name={name} size="lg" badge={badge} />
      <span className="mt-2 block text-sm font-semibold">{name}</span>
      <span className="block text-[0.6875rem] text-[var(--wh-foreground-muted)]">{role}</span>
      {now ? (
        <span className="mt-1.5 block truncate rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2 py-0.5 text-[0.6875rem] font-medium text-[var(--wh-foreground-muted)]">
          {now}
        </span>
      ) : null}
    </>
  );

  const base = cn(
    "flex w-28 shrink-0 flex-col items-center rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-3 text-center shadow-[var(--wh-shadow-card)]",
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
