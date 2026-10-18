"use client";

import { useEffect } from "react";

/**
 * Hides the phone's top and bottom bars while a person reads down a page,
 * and brings them back the moment they scroll up.
 *
 * The header goes first, a short way down; the tab bar follows once they
 * keep going, so the page they are reading gets the whole screen. Any scroll
 * up, the top of the page and the very end of it bring both back: the tabs
 * are always one small flick away, and the last row never ends behind a bar
 * that is about to reappear (rule 15). Phones only — the desktop's sidebar
 * and header stay. With reduced motion the bars still hide, without sliding.
 *
 * It only sets `data-wh-chrome` on <html>; the bars carry `wh-chrome-top` and
 * `wh-chrome-bottom`, and `ui-theme.css` does the rest, so the shell stays
 * server-rendered.
 */
export const HIDE_TOP_AFTER = 24;
export const HIDE_BOTTOM_AFTER = 280;
const SHOW_AFTER = 12;

export type ChromeState = "shown" | "top-hidden" | "all-hidden";

/** The next state from how far a person has moved since they last changed direction. Pure, for the tests. */
export function nextChrome(input: { y: number; travelled: number; atEnd: boolean; headerHeight: number }): ChromeState | null {
  if (input.y <= input.headerHeight || input.atEnd) return "shown";
  if (input.travelled <= -SHOW_AFTER) return "shown";
  if (input.travelled >= HIDE_BOTTOM_AFTER) return "all-hidden";
  if (input.travelled >= HIDE_TOP_AFTER) return "top-hidden";
  return null;
}

export function ScrollChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 1023.98px)");
    let last = window.scrollY;
    let travelled = 0;
    let state: ChromeState = "shown";
    let frame = 0;

    const set = (next: ChromeState) => {
      if (next === state) return;
      state = next;
      root.dataset.whChrome = next;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - last;
        last = y;
        if (!phone.matches) return set("shown");
        // Direction changed: start counting again from here.
        travelled = Math.sign(delta) === Math.sign(travelled) ? travelled + delta : delta;
        const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
        const header = parseFloat(getComputedStyle(root).getPropertyValue("--wh-header-height")) * parseFloat(getComputedStyle(root).fontSize) || 56;
        const next = nextChrome({ y, travelled, atEnd, headerHeight: header });
        if (next) set(next);
      });
    };

    root.dataset.whChrome = "shown";
    window.addEventListener("scroll", onScroll, { passive: true });
    phone.addEventListener("change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      phone.removeEventListener("change", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      delete root.dataset.whChrome;
    };
  }, []);

  return null;
}
