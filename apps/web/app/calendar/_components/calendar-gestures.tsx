"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

/** How far two fingers must spread or close, as a ratio of where they began, to change the view. */
export const PINCH_IN_RATIO = 1.25;
export const PINCH_OUT_RATIO = 0.8;
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_MS = 600;

/** What a finished two-finger gesture asks for, if anything. */
export function pinchIntent(startDistance: number, endDistance: number): "in" | "out" | null {
  if (startDistance <= 0) return null;
  const ratio = endDistance / startDistance;
  if (ratio >= PINCH_IN_RATIO) return "in";
  if (ratio <= PINCH_OUT_RATIO) return "out";
  return null;
}

type Pointer = { x: number; y: number };

/**
 * The calendar's own gestures (story 12-009, design §4 "Gestures", D7):
 *
 * - **Pinch** out moves Year → Month → Week → Day, pinch in the other way,
 *   keeping the focused date. Pointer events with a distance threshold;
 *   `touch-action: pan-y` sits on this surface alone, so page zoom elsewhere
 *   is untouched and vertical scrolling still works here.
 * - **Swipe** left or right moves to the next or previous period. The
 *   surface opts out of the primary-area swipe (`data-swipe="own"`).
 * - **Arrow keys** do the same as ‹ ›; the buttons always exist, so nothing
 *   here is the only way to do anything.
 *
 * Navigation is a plain route change, so `prefers-reduced-motion` has no
 * transition to turn off.
 */
export function CalendarGestures({
  children,
  previousHref,
  nextHref,
  zoomInHref,
  zoomOutHref,
  label,
}: {
  children: ReactNode;
  previousHref: string;
  nextHref: string;
  zoomInHref: string | null;
  zoomOutHref: string | null;
  label: string;
}) {
  const router = useRouter();
  const pointers = useRef(new Map<number, Pointer>());
  const pinchStart = useRef<number | null>(null);
  const pinchLast = useRef<number | null>(null);
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  return (
    <div
      data-swipe="own"
      role="region"
      aria-label={label}
      tabIndex={-1}
      className="touch-pan-y"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget && (event.target as HTMLElement).closest("input, textarea, select")) return;
        if (event.key === "ArrowLeft") router.push(document.dir === "rtl" ? nextHref : previousHref, { scroll: false });
        if (event.key === "ArrowRight") router.push(document.dir === "rtl" ? previousHref : nextHref, { scroll: false });
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 1) swipe.current = { x: event.clientX, y: event.clientY, at: performance.now() };
        if (pointers.current.size === 2) {
          swipe.current = null;
          pinchStart.current = distance();
          pinchLast.current = pinchStart.current;
        }
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2) pinchLast.current = distance();
      }}
      onPointerUp={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        const start = swipe.current;
        pointers.current.delete(event.pointerId);
        if (pinchStart.current !== null && pointers.current.size < 2) {
          const intent = pinchIntent(pinchStart.current, pinchLast.current ?? pinchStart.current);
          pinchStart.current = null;
          pinchLast.current = null;
          const target = intent === "in" ? zoomInHref : intent === "out" ? zoomOutHref : null;
          if (target) router.push(target, { scroll: false });
          return;
        }
        if (start && pointers.current.size === 0) {
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          swipe.current = null;
          if (performance.now() - start.at > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) * 0.6) return;
          const forward = document.dir === "rtl" ? dx > 0 : dx < 0;
          router.push(forward ? nextHref : previousHref, { scroll: false });
        }
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId);
        pinchStart.current = null;
        swipe.current = null;
      }}
    >
      {children}
    </div>
  );
}
