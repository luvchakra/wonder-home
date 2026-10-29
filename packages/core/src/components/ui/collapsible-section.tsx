import type { ComponentType, ReactNode } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

export type CollapsibleSectionProps = {
  /** Anchor target, for links elsewhere on the page that scroll to this section. */
  id?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: IconTone;
  /** The heading — its visible text is the disclosure's accessible name. */
  title: ReactNode;
  /** One line under the title that stays visible while the section is folded. */
  intro?: ReactNode;
  /** A small count beside the title, like SectionHeader's. */
  count?: number;
  /** Open on first render. Sections fold closed by default to keep the page short. */
  defaultOpen?: boolean;
  /** `h2` for a top-level section, `h3`/`h4` when nested inside one. */
  as?: "h2" | "h3" | "h4";
  className?: string;
  children: ReactNode;
};

/**
 * A section that folds behind its own header — the same native
 * `<details>`/`<summary>` fold the playbook area cards and the notifications
 * routing card use (settings/_household/manage-section.tsx,
 * settings/notifications). The header — tinted tile, title, one intro line —
 * stays visible as the summary with a chevron that rotates on open; tapping it
 * (or Enter/Space, since `<summary>` is a real button with an implicit
 * aria-expanded) reveals the body. No client component and no extra aria
 * wording: the visible title names the control. The summary is a 48px-tall
 * target (principle: 44px minimum) and the title wraps rather than truncates
 * (principle 11).
 */
export function CollapsibleSection({
  id,
  icon,
  tone = "primary",
  title,
  intro,
  count,
  defaultOpen = false,
  as: Heading = "h2",
  className,
  children,
}: CollapsibleSectionProps) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={cn(
        "group scroll-mt-20 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]",
        className,
      )}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <Heading className="flex items-center gap-2 text-lg font-semibold tracking-tight break-words">
            {title}
            {typeof count === "number" && count > 0 ? (
              <span className="grid size-5 shrink-0 place-items-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary)] text-[0.625rem] font-bold text-[var(--wh-primary-foreground)]">
                {count}
              </span>
            ) : null}
          </Heading>
          {intro ? <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{intro}</p> : null}
        </div>
        <ChevronDown aria-hidden className="mt-1.5 size-5 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-[var(--wh-border)] p-4">{children}</div>
    </details>
  );
}
