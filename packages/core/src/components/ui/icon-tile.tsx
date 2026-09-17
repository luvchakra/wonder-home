import type { ComponentType } from "react";

import { cn } from "../../lib/cn";

/**
 * The tinted glyph tile every list row in the mockups begins with.
 *
 * The tone is chosen by domain rather than by urgency, so a bill looks like a
 * bill whether it is due tomorrow or paid. Urgency is carried by the row's
 * action and its wording — colour alone is never the signal, because a quarter
 * of readers will not see the difference reliably.
 */
export const ICON_TONES = ["money", "school", "people", "home", "care", "primary"] as const;
export type IconTone = (typeof ICON_TONES)[number];

const TONE_CLASS: Record<IconTone, string> = {
  money: "bg-[var(--wh-tone-money-soft)] text-[var(--wh-tone-money)]",
  school: "bg-[var(--wh-tone-school-soft)] text-[var(--wh-tone-school)]",
  people: "bg-[var(--wh-tone-people-soft)] text-[var(--wh-tone-people)]",
  home: "bg-[var(--wh-tone-home-soft)] text-[var(--wh-tone-home)]",
  care: "bg-[var(--wh-tone-care-soft)] text-[var(--wh-tone-care)]",
  primary: "bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]",
};

export type IconTileProps = {
  icon: ComponentType<{ className?: string }>;
  tone?: IconTone;
  size?: "sm" | "md";
  className?: string;
};

export function IconTile({ icon: Icon, tone = "primary", size = "md", className }: IconTileProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-[var(--wh-radius-sm)]",
        size === "md" ? "size-10" : "size-8",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}
