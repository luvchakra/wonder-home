"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * Whether a conversation with HomeTalk is going on right now, for the raised
 * HomeTalk button in the tab bar to show it.
 *
 * The composer is the only writer: it says "talking" while it is listening,
 * transcribing or holding a live conversation, and "idle" otherwise or when
 * it goes away. One small module-level store, read with
 * `useSyncExternalStore`, so the shell needs no provider around every page.
 */
export type TalkActivity = "idle" | "listening" | "live" | "paused";

let current: TalkActivity = "idle";
const listeners = new Set<() => void>();

export function setTalkActivity(next: TalkActivity): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTalkActivity(): TalkActivity {
  return useSyncExternalStore(subscribe, () => current, () => "idle" as const);
}

/**
 * The raised button's disc, pulsing while a conversation is in progress and
 * saying so to a screen reader. The pulse is a ring behind the disc, never
 * over the icon, and holds still under `prefers-reduced-motion` (the ring
 * stays, so the state is still shown).
 */
export function TalkButtonDisc({ className, label, children }: { className?: string; label: string; children: ReactNode }) {
  const activity = useTalkActivity();
  const talking = activity === "listening" || activity === "live";
  return (
    <span className={cn("relative", className)} data-talking={talking ? "true" : undefined}>
      {talking ? (
        <>
          {/* A steady ring that says "in progress" even with motion reduced, and a wave behind it. */}
          <span aria-hidden className="pointer-events-none absolute -inset-1.5 rounded-full ring-2 ring-[var(--wh-primary)]" />
          <span aria-hidden className="pointer-events-none absolute -inset-1.5 rounded-full bg-[var(--wh-primary)]/30 motion-safe:animate-ping" />
        </>
      ) : activity === "paused" ? (
        <span aria-hidden className="pointer-events-none absolute -inset-1.5 rounded-full ring-2 ring-[var(--wh-foreground-subtle)]" />
      ) : null}
      <span className={cn("relative grid place-items-center", talking && "motion-safe:animate-pulse")}>{children}</span>
      {talking || activity === "paused" ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
