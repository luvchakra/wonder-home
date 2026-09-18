import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@wonderhome/core/ui/brand";
import { Card } from "@wonderhome/core/ui/card";
import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";

import { HomeIllustration } from "./home-illustration";

export type AuthLayoutProps = {
  title: string;
  lede: string;
  children: ReactNode;
  footer?: { prompt: string; href: string; label: string };
  /** "Step 2 of 3" during onboarding. */
  step?: { current: number; total: number };
  /** The line on the illustrated panel. */
  promise?: { headline: string; points: string[] };
  /** The handwritten line under the form. One per screen, decoration only. */
  accent?: string;
};

/**
 * The signed-out frame: one task, no navigation, and on a wide screen the
 * illustrated promise beside it (mockup sheet F, screen 1). Calm, warm, and
 * the same design language as the product behind it.
 */
export function AuthLayout({ title, lede, children, footer, step, promise, accent }: AuthLayoutProps) {
  const pitch = promise ?? {
    headline: "A calmer home is possible.",
    points: ["Less mental load", "More family time", "A brighter tomorrow"],
  };

  return (
    <main className="relative min-h-dvh overflow-x-clip lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside
        aria-hidden
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{ background: "var(--wh-gradient-hero)" }}
      >
        <Wordmark tagline size={36} />
        <div className="relative z-10 max-w-md">
          <h2 className="text-[var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">{pitch.headline}</h2>
          <ul className="mt-6 space-y-2">
            {pitch.points.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-[0.9375rem] text-[var(--wh-foreground-muted)]">
                <span className="grid size-5 place-items-center rounded-full bg-[var(--wh-handled-soft)] text-[var(--wh-handled)]">✓</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <LeafDecor corner="top-right" size={280} opacity={0.45} />
        <LeafDecor corner="bottom-left" size={200} opacity={0.3} />
        <HomeIllustration className="pointer-events-none absolute -right-16 -bottom-10 w-[34rem] opacity-95" />
        <ScriptAccent tone="people" size="md" heart className="relative z-10">
          Home runs smoother. Together.
        </ScriptAccent>
      </aside>

      <div className="relative mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-4 py-10 lg:px-10">
        {/* The mockups frame the form with greenery on a phone too, where the
            illustrated panel beside it is not there to carry the warmth. */}
        <LeafDecor corner="top-right" size={170} opacity={0.24} className="lg:hidden" />

        <div className="lg:hidden">
          <Link href="/" aria-label="WonderHome home" className="inline-block">
            <Wordmark tagline size={32} />
          </Link>
        </div>

        <header className="space-y-1.5">
          {step ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[var(--wh-primary)]">Step {step.current} of {step.total}</p>
              <div className="flex gap-1.5" aria-hidden>
                {Array.from({ length: step.total }, (_, index) => (
                  <span key={index} className={`h-1.5 flex-1 rounded-full ${index < step.current ? "bg-[var(--wh-primary)]" : "bg-[var(--wh-border)]"}`} />
                ))}
              </div>
            </div>
          ) : null}
          <h1 className="text-[var(--wh-text-title)] font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{lede}</p>
        </header>

        <Card className="p-5 shadow-[var(--wh-shadow-raised)]">{children}</Card>

        {accent ? <ScriptAccent tone="primary" size="sm" className="mx-auto text-center">{accent}</ScriptAccent> : null}

        {footer ? (
          <p className="text-center text-sm text-[var(--wh-foreground-muted)]">
            {footer.prompt}{" "}
            <Link href={footer.href} className="font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
              {footer.label}
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
