"use client";

import type { ReactNode } from "react";

import type { PrimaryNavKey } from "../../navigation/primary-navigation";
import { usePrimarySwipeNav } from "../../navigation/use-primary-swipe-nav";

/**
 * The page's own `<main>`, plus the swipe-between-primary-areas gesture
 * (design principle 16). Kept as its own small client boundary rather than
 * making the whole `AppShell` client-side — `children` is already-rendered
 * JSX from the server, passed through untouched.
 */
export function SwipeMain({
  active,
  ariaLabel,
  className,
  children,
}: {
  active: PrimaryNavKey;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const swipe = usePrimarySwipeNav(active);

  return (
    <main id="wh-main" aria-label={ariaLabel} className={className} onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      {children}
    </main>
  );
}
