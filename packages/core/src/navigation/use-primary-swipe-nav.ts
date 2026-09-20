"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { TouchEvent } from "react";

import { PRIMARY_NAVIGATION, type PrimaryNavKey } from "./primary-navigation";

/**
 * Home, Today, AI, Family, More are a sequence (design principle 16), so a
 * full-width horizontal swipe on a primary screen moves to the next or
 * previous one — additive to the tab bar and sidebar, never a replacement.
 *
 * A swipe never fires from inside a form, an editable field, or a scroller
 * that wants the horizontal gesture for itself (a carousel, a horizontally
 * scrolling list) — those are decided on touchstart, before any navigation
 * commitment is made. A sheet or dialog is excluded for free: Radix renders
 * them through a portal outside `main`, so their touches never reach this
 * handler at all.
 */
export const SWIPE_MIN_DISTANCE = 72;
export const SWIPE_MAX_DURATION_MS = 600;
export const SWIPE_MAX_VERTICAL_RATIO = 0.5;

type TouchState = { x: number; y: number; time: number; eligible: boolean };

/** The pure decision: does this gesture amount to "go to the next/previous primary area", and where to. */
export function resolveSwipeTarget({
  active,
  dx,
  dy,
  elapsedMs,
  eligible,
}: {
  active: PrimaryNavKey;
  dx: number;
  dy: number;
  elapsedMs: number;
  eligible: boolean;
}): string | null {
  if (!eligible) return null;
  if (elapsedMs > SWIPE_MAX_DURATION_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return null;

  const index = PRIMARY_NAVIGATION.findIndex((item) => item.key === active);
  if (index === -1) return null;
  const next = PRIMARY_NAVIGATION[dx < 0 ? index + 1 : index - 1];
  return next?.href ?? null;
}

/** Would this touch's own target rather handle a horizontal gesture itself? */
export function wantsTheGestureItself(target: EventTarget | null, boundary: HTMLElement): boolean {
  let node = target instanceof Node ? target : null;
  while (node && node !== boundary) {
    if (node instanceof HTMLElement) {
      if (node.tagName === "FORM" || node.isContentEditable) return true;
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT") return true;
      if (node.scrollWidth > node.clientWidth + 1) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return true;
      }
    }
    node = node.parentNode;
  }
  return false;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function usePrimarySwipeNav(active: PrimaryNavKey) {
  const router = useRouter();
  const touch = useRef<TouchState | null>(null);

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    if (event.touches.length !== 1) {
      touch.current = null;
      return;
    }
    const start = event.touches[0];
    if (!start) return;
    touch.current = {
      x: start.clientX,
      y: start.clientY,
      time: Date.now(),
      eligible: !wantsTheGestureItself(event.target, event.currentTarget),
    };
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;

    const end = event.changedTouches[0];
    if (!end) return;

    const href = resolveSwipeTarget({
      active,
      dx: end.clientX - start.x,
      dy: end.clientY - start.y,
      elapsedMs: Date.now() - start.time,
      eligible: start.eligible,
    });
    if (!href) return;

    const navigate = () => router.push(href);
    const withTransition = (document as { startViewTransition?: (cb: () => void) => void }).startViewTransition;
    if (withTransition && !prefersReducedMotion()) withTransition.call(document, navigate);
    else navigate();
  }

  return { onTouchStart, onTouchEnd };
}
