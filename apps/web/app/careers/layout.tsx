import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";
import { Wordmark } from "@wonderhome/core/ui/brand";

export const metadata: Metadata = {
  title: { default: "Careers", template: "%s · Careers at WonderHome" },
  description: "Open positions at WonderHome, the household operating system.",
  robots: { index: true, follow: true },
};

/**
 * The careers pages' frame: public, signed out, the landing page's warm
 * surface. Everything on them comes from WonderJobs; nothing is sample data.
 */
export default function CareersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-[var(--wh-background)]">
      <LeafDecor corner="top-right" opacity={0.25} className="pointer-events-none absolute" />
      <main className="relative px-4 py-8 lg:px-8 lg:py-12">
        <div className="mx-auto max-w-3xl space-y-8">
          <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Careers">
            <Link href="/" aria-label="WonderHome home" className="inline-block rounded-[var(--wh-radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
              <Wordmark size={28} />
            </Link>
            <Link href="/careers" className="text-sm font-medium text-[var(--wh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
              All open positions
            </Link>
          </nav>
          {children}
          <footer className="space-y-2 border-t border-[var(--wh-border)] pt-6 text-sm text-[var(--wh-foreground-muted)]">
            <ScriptAccent size="sm" tone="muted">Build calmer homes with us.</ScriptAccent>
            <p>
              Applications are handled by WonderJobs for WonderHome. <Link href="/legal" className="underline">Terms and privacy</Link>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
