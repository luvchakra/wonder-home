import { Languages, X } from "lucide-react";
import Link from "next/link";

import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { dismissLocalePromptAction } from "../(auth)/locale-actions";

/**
 * "Personalize your experience" on Home (story 22-003, spec §20): language,
 * region and currency, offered once and quietly. The row is the one way in;
 * the × puts it away for good — Settings still has everything.
 */
export function PersonalizeCard({ title, body, action, dismissLabel }: { title: string; body: string; action: string; dismissLabel: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-2 ps-2 pe-1 shadow-[var(--wh-shadow-card)]">
      <Link href="/onboarding/personalize" className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-1 hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
        <IconTile icon={Languages} tone="primary" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-[var(--wh-foreground-muted)]">{body}</span>
        </span>
        <span className="inline-flex min-h-9 shrink-0 items-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-3 text-xs font-semibold text-[var(--wh-primary)]">{action}</span>
      </Link>
      <form action={dismissLocalePromptAction}>
        <button type="submit" aria-label={dismissLabel} className="grid size-10 place-items-center rounded-full text-[var(--wh-foreground-subtle)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
          <X aria-hidden className="size-4" />
        </button>
      </form>
    </div>
  );
}
