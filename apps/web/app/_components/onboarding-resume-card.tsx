import Link from "next/link";

import type { OnboardingSummary } from "@wonderhome/core/household/onboarding";
import { ProgressRing } from "@wonderhome/core/ui/progress-ring";

/**
 * Setup that has not finished, on Home (story 02-009): how far it got, the
 * one thing most worth doing next, and a way straight back to where the
 * household left off. The whole row is the one way in, so "Continue" is
 * not a second button beside it (rule 14).
 */
export function OnboardingResumeCard({ summary }: { summary: OnboardingSummary }) {
  return (
    <Link
      href="/onboarding"
      className="flex min-h-16 items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 py-3 shadow-[var(--wh-shadow-card)] transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
    >
      <ProgressRing value={summary.percent} label="Household setup" size={48} stroke={5} className="[&>span]:text-[0.6875rem]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Household setup · {summary.milestone}</span>
        <span className="block text-xs text-[var(--wh-foreground-muted)]">{summary.next ? `Next: ${summary.next.label}` : "Everything is in place — finish when you're ready"}</span>
      </span>
      <span className="inline-flex min-h-9 shrink-0 items-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary)] px-3.5 text-xs font-semibold text-[var(--wh-primary-foreground)]">Continue</span>
    </Link>
  );
}
