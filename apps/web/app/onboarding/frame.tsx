import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { OnboardingStep } from "@wonderhome/core/household/onboarding";
import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";

import { deferAction } from "../(auth)/onboarding-actions";
import { OnboardingForm } from "./onboarding-form";

/**
 * The setup frame (mockup: onboarding sheet): a way back, "Step 2 of 4" with
 * its bar, and — on the screens that have no "I'll do this later" of their
 * own — a close that does exactly that, so there is never a second button
 * for the same job (rule 14). No navigation: setup is one task at a time.
 */
export function OnboardingFrame({
  step,
  progress,
  total = 4,
  stepLabel,
  backLabel = "Back",
  back,
  close = false,
  title,
  lede,
  accent,
  children,
}: {
  step: OnboardingStep;
  /** Which of the four steps this screen belongs to, if any. */
  progress?: number;
  /** How many steps this flow has — four for family setup, six for language and region. */
  total?: number;
  /** "Step 2 of 6" in the reader's language; English when not given. */
  stepLabel?: string;
  backLabel?: string;
  back?: string | null;
  close?: boolean;
  title?: ReactNode;
  lede?: ReactNode;
  /** The one handwritten line (principle 2). */
  accent?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-dvh overflow-x-clip bg-[var(--wh-background)]">
      <LeafDecor corner="top-right" size={180} opacity={0.2} />
      <LeafDecor corner="bottom-left" size={160} opacity={0.16} />
      <div className="relative mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-4 pb-10 sm:pt-8">
        <div className="grid min-h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
          {back ? (
            <Link
              href={back}
              aria-label={backLabel}
              className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
            >
              <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
          {progress ? (
            <div className="mx-auto w-full max-w-40 space-y-1.5 text-center">
              <p className="text-xs font-medium text-[var(--wh-foreground-muted)]">{stepLabel ?? `Step ${progress} of ${total}`}</p>
              <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={progress}
                className="h-1.5 overflow-hidden rounded-full bg-[var(--wh-border)]"
              >
                <span className="block h-full rounded-full bg-[var(--wh-primary)]" style={{ width: `${(progress / total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <span />
          )}
          {close ? (
            <OnboardingForm action={deferAction}>
              <input type="hidden" name="step" value={step} />
              <button
                type="submit"
                aria-label="Finish setup later"
                className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
              >
                <X className="size-5" aria-hidden />
              </button>
            </OnboardingForm>
          ) : (
            <span />
          )}
        </div>

        {title ? (
          <header className="space-y-2">
            <h1 className="text-[length:var(--wh-text-title)] leading-tight font-bold tracking-tight text-balance">{title}</h1>
            {lede ? <p className="text-[0.9375rem] text-[var(--wh-foreground-muted)]">{lede}</p> : null}
          </header>
        ) : null}

        {children}

        {accent ? (
          <ScriptAccent tone="primary" size="sm" className="mx-auto mt-2 text-center">
            {accent}
          </ScriptAccent>
        ) : null}
      </div>
    </main>
  );
}

/** The quiet secondary action under a screen's main button. */
export function LaterButton({ step, label = "I'll do this later" }: { step: OnboardingStep; label?: string }) {
  return (
    <OnboardingForm action={deferAction} className="text-center">
      <input type="hidden" name="step" value={step} />
      <button
        type="submit"
        className="min-h-11 px-4 text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
      >
        {label}
      </button>
    </OnboardingForm>
  );
}
