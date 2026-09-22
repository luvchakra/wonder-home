"use client";

import { DropdownMenu } from "radix-ui";
import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type AddTaskOption = {
  href: string;
  label: string;
  /** Already-rendered (e.g. an `<IconTile>`) — a Client Component boundary
   * can't accept a raw component reference from server code. */
  icon: ReactNode;
};

/**
 * A quick launcher to each domain's own "add" entry point — not a second,
 * competing door to the assistant (rule 13: every option here is a manual
 * add flow a screen already owns), and not a generic checklist item (rule
 * "Manage outcomes, not micro-task checklists" — picking an option always
 * lands on a real domain's own add form, nothing is created here directly).
 */
export function AddTaskMenu({ options, className }: { options: readonly AddTaskOption[]; className?: string }) {
  if (options.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary)] px-3.5 text-xs font-semibold text-[var(--wh-primary-foreground)] transition-colors hover:bg-[var(--wh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
            className,
          )}
        >
          <Plus aria-hidden className="size-4" />
          Add task
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-40 min-w-56 rounded-[var(--wh-radius-md)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1.5 shadow-[var(--wh-shadow-float)] data-[state=open]:animate-[wh-rise_var(--wh-duration)_var(--wh-ease)]"
        >
          {options.map((option) => (
            <DropdownMenu.Item key={option.href} asChild>
              <Link
                href={option.href}
                className="flex items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 py-2 text-sm outline-none data-[highlighted]:bg-[var(--wh-surface-muted)]"
              >
                {option.icon}
                {option.label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
