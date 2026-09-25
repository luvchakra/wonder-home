import {
  BookOpen,
  CalendarHeart,
  ChevronRight,
  CircleCheck,
  Clock3,
  GraduationCap,
  Home,
  ListChecks,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { SetupAssessment, SetupStep, SetupStepKey } from "../../household/setup";
import { cn } from "../../lib/cn";
import { Card } from "./card";
import { IconTile } from "./icon-tile";
import { PillLink } from "./pill";
import { ProgressRing } from "./progress-ring";

/**
 * Household setup progress (requirements §9, §21).
 *
 * Three shapes of the same number. `prominent` takes the top of Home for a
 * new head or administrator's first week; `compact` is one quiet row once the
 * week has passed and the household is not yet complete; `full` is the whole
 * checklist on Manage Household. At 100% the prominent card becomes the
 * achievement it should feel like, and the compact row disappears.
 */

/**
 * The card's own words, in the reader's language (story 22-004), built by
 * the page with this assessment's counts already in them. Each falls back
 * to the English below. The steps' titles and reasons, and the milestone,
 * come on the assessment itself.
 */
export type SetupProgressLabels = {
  title: string;
  setUp: string;
  compactTitle: string;
  compactMeta: string;
  completeTitle: string;
  completeLede: string;
  progress: string;
  firstWeek: string | null;
  seeAll: string;
};

const ICONS: Record<SetupStepKey, LucideIcon> = {
  basics: Home,
  people: Users,
  children: Users,
  guardians: ShieldCheck,
  helper_hours: Clock3,
  responsibilities: ListChecks,
  playbook: BookOpen,
  policies: ShieldCheck,
  home: Home,
  bills: Wallet,
  meals: Utensils,
  school: GraduationCap,
  family_time: CalendarHeart,
};

export function SetupProgressCard({
  assessment,
  variant,
  daysLeft,
  manageHref = "/household/setup",
  className,
  labels,
}: {
  assessment: SetupAssessment;
  variant: "prominent" | "compact" | "full";
  /** Days left in the prominent week, for the prominent variant's small print. */
  daysLeft?: number;
  manageHref?: string;
  className?: string;
  labels?: SetupProgressLabels;
}) {
  const words: SetupProgressLabels = labels ?? {
    title: "Household setup",
    setUp: "Set up your household",
    compactTitle: `Household setup · ${assessment.milestone}`,
    compactMeta: assessment.next[0] ? `Next: ${assessment.next[0].title}` : `${assessment.done} of ${assessment.total} done`,
    completeTitle: "Your household is fully set up",
    completeLede: `All ${assessment.total} steps done. WonderHome now knows enough to keep quiet watch over every part of the home.`,
    progress: `${assessment.done} of ${assessment.total} done. Each step you fill in is something WonderHome can start looking after for you.`,
    firstWeek: daysLeft !== undefined && daysLeft > 0 ? `Your first week: ${daysLeft === 1 ? "1 day" : `${daysLeft} days`} of guided setup left.` : null,
    seeAll: `See all ${assessment.total} steps`,
  };

  if (variant === "compact") {
    return (
      <Link
        href={manageHref}
        className={cn(
          "flex min-h-14 items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 py-2.5 shadow-[var(--wh-shadow-card)] transition-colors hover:bg-[var(--wh-surface-muted)]",
          className,
        )}
      >
        <ProgressRing value={assessment.percent} label={words.title} size={44} stroke={5} className="[&>span]:text-[0.625rem]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{words.compactTitle}</span>
          <span className="block text-xs text-[var(--wh-foreground-subtle)]">{words.compactMeta}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
      </Link>
    );
  }

  if (assessment.complete && variant === "prominent") {
    return (
      <Card className={cn("wh-rise flex items-center gap-4 border-[var(--wh-primary)]/30 bg-[var(--wh-primary-soft)]/40 p-4", className)}>
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--wh-primary)] text-white shadow-[var(--wh-shadow-raised)]">
          <PartyPopper aria-hidden className="size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight">{words.completeTitle}</p>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{words.completeLede}</p>
        </div>
      </Card>
    );
  }

  const shown = variant === "full" ? assessment.steps : assessment.next;

  return (
    <Card className={cn("wh-rise p-4 sm:p-5", className)}>
      <div className="flex items-start gap-4">
        <ProgressRing value={assessment.percent} label={words.title} size={variant === "full" ? 96 : 84} stroke={8} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              {variant === "full" ? words.title : words.setUp}
            </h2>
            <span className="rounded-full bg-[var(--wh-primary-soft)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--wh-primary)]">
              {assessment.milestone}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--wh-foreground-muted)]">{words.progress}</p>
          {variant === "prominent" && words.firstWeek ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--wh-foreground-subtle)]">
              <Sparkles aria-hidden className="size-3.5" />
              {words.firstWeek}
            </p>
          ) : null}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[var(--wh-border)]">
        {shown.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ul>

      {variant === "prominent" && assessment.total > assessment.next.length + assessment.done ? (
        <div className="mt-3 flex justify-end">
          <PillLink href={manageHref} tone="quiet">
            {words.seeAll}
          </PillLink>
        </div>
      ) : null}
    </Card>
  );
}

function StepRow({ step }: { step: SetupStep }) {
  const Icon = ICONS[step.key];

  if (step.done) {
    return (
      <li className="flex items-center gap-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-handled-soft)]">
          <CircleCheck aria-hidden className="size-5 text-[var(--wh-handled)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-[var(--wh-foreground-muted)] line-through decoration-[var(--wh-border-strong)]">
            {step.title}
          </span>
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={step.href}
        className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] py-2.5 transition-colors hover:bg-[var(--wh-surface-muted)]"
      >
        <IconTile icon={Icon} tone={step.tone} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{step.title}</span>
          <span className="block text-xs text-[var(--wh-foreground-muted)]">{step.why}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
      </Link>
    </li>
  );
}
