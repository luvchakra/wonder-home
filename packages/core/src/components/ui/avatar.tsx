import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A person, as initials on a tinted disc.
 *
 * No photos yet: none are stored, and a placeholder face would be a fake. The
 * tint is derived from the name so the same person is the same colour on every
 * screen, and a child, an adult, a helper and a pet are distinguishable by the
 * small role glyph rather than by colour alone.
 */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE: Record<AvatarSize, string> = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
};

/** Five warm tints that all sit on the cream page and pass contrast for text. */
const TINTS = [
  "bg-[var(--wh-tone-people-soft)] text-[var(--wh-tone-people)]",
  "bg-[var(--wh-tone-school-soft)] text-[var(--wh-tone-school)]",
  "bg-[var(--wh-tone-home-soft)] text-[var(--wh-tone-home)]",
  "bg-[var(--wh-tone-care-soft)] text-[var(--wh-tone-care)]",
  "bg-[var(--wh-tone-money-soft)] text-[var(--wh-tone-money)]",
] as const;

/** Just the background half of the same five tints, for a card that wants colour behind the whole row rather than only the avatar. Indexed identically to `TINTS`, so a person is the same colour whichever of the two they're drawn with. */
const CARD_TINTS = [
  "bg-[var(--wh-tone-people-soft)]",
  "bg-[var(--wh-tone-school-soft)]",
  "bg-[var(--wh-tone-home-soft)]",
  "bg-[var(--wh-tone-care-soft)]",
  "bg-[var(--wh-tone-money-soft)]",
] as const;

function tintIndexFor(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TINTS.length;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function tintFor(name: string): string {
  return TINTS[tintIndexFor(name)]!;
}

export function cardTintFor(name: string): string {
  return CARD_TINTS[tintIndexFor(name)]!;
}

export type AvatarProps = {
  name: string;
  size?: AvatarSize;
  /** A small glyph in the corner naming the kind of member. */
  badge?: ReactNode;
  className?: string;
};

export function Avatar({ name, size = "md", badge, className }: AvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        role="img"
        aria-label={name}
        className={cn(
          "grid place-items-center rounded-full font-semibold ring-2 ring-[var(--wh-surface)]",
          SIZE[size],
          tintFor(name),
        )}
      >
        {initialsOf(name)}
      </span>
      {badge ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-[var(--wh-surface)] text-[0.5625rem] shadow-[var(--wh-shadow-card)]"
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}

/** Several people overlapping, with "+n" when there are too many to show. */
export function AvatarGroup({
  names,
  max = 4,
  size = "sm",
  className,
}: {
  names: readonly string[];
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;

  return (
    <span className={cn("inline-flex items-center -space-x-2", className)}>
      {shown.map((name) => (
        <Avatar key={name} name={name} size={size} />
      ))}
      {rest > 0 ? (
        <span
          className={cn(
            "grid place-items-center rounded-full bg-[var(--wh-surface-muted)] font-semibold text-[var(--wh-foreground-muted)] ring-2 ring-[var(--wh-surface)]",
            SIZE[size],
          )}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
