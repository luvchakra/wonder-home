"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@wonderhome/core/ui/button";
import { Wordmark } from "@wonderhome/core/ui/brand";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";

/**
 * The app-wide error boundary (Next.js App Router convention).
 *
 * Design principle 10 requires every screen to have an error state, not just
 * an empty and a loading one — and until this file existed, nothing caught
 * an unexpected server-render exception anywhere in the app. It fell through
 * to the platform's own bare failure page instead: no household name, no
 * brand, no way back in, on whichever screen happened to throw first.
 *
 * This is a client component (the Next.js contract for `error.tsx`), so it
 * cannot read the session or render the signed-in shell — it is the one
 * screen in the app that cannot assume either. What it can do is look like
 * WonderHome, say plainly that something went wrong, and offer two honest
 * ways forward: try again, or start over from the front door.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Not a diagnostics pipeline — just keeps the failure visible in the
    // server console instead of vanishing the moment the boundary catches it.
    console.error("Unhandled route error", error);
  }, [error]);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10" style={{ background: "var(--wh-background)" }}>
      <LeafDecor corner="top-right" size={220} opacity={0.28} />
      <LeafDecor corner="bottom-left" size={180} opacity={0.22} />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4 rounded-[var(--wh-radius-lg)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-6 text-center shadow-[var(--wh-shadow-raised)]">
        <Wordmark size={28} />
        <IconTile icon={AlertTriangle} tone="attention" size="lg" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Something went wrong on this screen</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Nothing you did caused this, and nothing was changed. Try again, or head back to the front door.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button onClick={reset} className="flex-1">Try again</Button>
          <ButtonLink href="/" variant="secondary" className="flex-1">Go to WonderHome</ButtonLink>
        </div>
        {error.digest ? (
          <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">Reference: {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
