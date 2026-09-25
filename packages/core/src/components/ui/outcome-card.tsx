import { ChevronRight, CircleCheck } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * "WonderHome handled" — the reassuring list of outcomes reached without
 * anyone: an order prepared, a class confirmed, a reminder dealt with.
 *
 * Deliberately smaller and quieter than Needs You. These exist to be glanced at
 * and believed, not read line by line.
 */
export type HandledItem = { key: string; title: string; meta?: string };

/**
 * Two to a row, including on a phone (rule 19's pair layout). These are
 * short — a domain and a few words about it — and they wrap rather than
 * truncate, so half width costs nothing and the quiet good news stays
 * compact instead of running down the screen.
 */
export function HandledList({ items, className }: { items: readonly HandledItem[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-2", className)}>
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-2.5 rounded-[var(--wh-radius-sm)] bg-[var(--wh-handled-soft)]/70 px-3 py-2.5"
        >
          <CircleCheck aria-hidden className="size-4 shrink-0 text-[var(--wh-handled)]" />
          <span className="min-w-0">
            <span className="block text-[0.8125rem] font-medium">{item.title}</span>
            {item.meta ? (
              <span className="block text-[0.6875rem] text-[var(--wh-foreground-muted)]">{item.meta}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A responsibility as an outcome — "Laundry ready", not the steps to get there.
 */
export type ResponsibilityCardProps = {
  icon: ComponentType<{ className?: string }>;
  tone: IconTone;
  title: string;
  owner: string;
  backup?: string | null;
  frequency?: string;
  aiMode: "observe" | "prepare" | "approve" | "execute";
  /** The autonomy level in the reader's language; `AI_MODE_LABEL` otherwise. */
  aiModeLabel?: string;
  /** "backup Priya" in the reader's language; the English otherwise. */
  backupLabel?: string;
  action?: ReactNode;
  /** When present, the whole row opens something — a chevron says so. */
  onExpand?: () => void;
  className?: string;
};

/** The same wording wherever an autonomy level is shown, not one phrasing per screen. */
export const AI_MODE_LABEL: Record<ResponsibilityCardProps["aiMode"], string> = {
  observe: "WonderHome watches",
  prepare: "WonderHome prepares",
  approve: "WonderHome asks first",
  execute: "WonderHome handles it",
};

export function ResponsibilityCard({ icon, tone, title, owner, backup, frequency, aiMode, aiModeLabel, backupLabel, action, onExpand, className }: ResponsibilityCardProps) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">
          {owner}
          {backup ? ` · ${backupLabel ?? `backup ${backup}`}` : ""}
          {frequency ? ` · ${frequency}` : ""}
        </p>
        <p className="mt-0.5 text-[0.6875rem] font-medium text-[var(--wh-primary)]">{aiModeLabel ?? AI_MODE_LABEL[aiMode]}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
      {onExpand ? <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" /> : null}
    </>
  );

  if (onExpand) {
    return (
      <li>
        <button
          type="button"
          onClick={onExpand}
          className={cn(
            "flex w-full items-center gap-3 rounded-[var(--wh-radius-sm)] py-3 text-left transition-colors hover:bg-[var(--wh-surface-muted)]",
            className,
          )}
        >
          {body}
        </button>
      </li>
    );
  }

  return <li className={cn("flex items-center gap-3 py-3", className)}>{body}</li>;
}
