"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keeps a field's open list of suggestions on screen (the owner, 2026-10-20:
 * "the page should adjust so that the options are properly visible, ensure
 * no flicker, implement such experience everywhere").
 *
 * On a phone the list sits in the flow under its field (`pointer-coarse:static`
 * in each list's classes), so opening it gives the page room to scroll. Once it
 * has opened, and again whenever its options or the on-screen keyboard change,
 * the nearest scrolling area moves just far enough that the list's last option
 * clears what is still visible above the keyboard, and never so far that the
 * field being typed in leaves the top. The move is instant, in one frame, so
 * nothing slides and then slides back. Whatever still does not fit scrolls
 * inside the list itself, which is capped to the space left.
 *
 * Every suggestion list in the kit uses this; a new one does too.
 */
export function useKeepListInView(open: boolean, anchor: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>, contentKey: unknown): void {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let frame = 0;
    const settle = () => {
      frame = 0;
      const field = anchor.current;
      const options = list.current;
      if (!field || !options) return;
      options.style.maxHeight = "";
      const viewport = window.visualViewport;
      const scroller = scrollParent(options);
      const box = scroller ? scroller.getBoundingClientRect() : null;
      const viewTop = viewport ? viewport.offsetTop : 0;
      const viewBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const top = Math.max(box ? box.top : viewTop, viewTop) + 8;
      const bottom = Math.min(box ? box.bottom : viewBottom, viewBottom) - 8;
      const fieldBox = field.getBoundingClientRect();
      const listBox = options.getBoundingClientRect();
      const need = listBox.bottom - bottom;
      if (need > 0) {
        // Never past the point where the field itself would leave the top.
        const by = Math.max(0, Math.min(need, fieldBox.top - top));
        if (by > 0) {
          if (scroller) scroller.scrollTop += by;
          else window.scrollBy({ top: by, behavior: "instant" as ScrollBehavior });
        }
        // What still cannot be shown scrolls inside the list, never under the keyboard.
        const after = options.getBoundingClientRect();
        if (after.bottom > bottom) options.style.maxHeight = `${Math.max(132, Math.floor(bottom - after.top))}px`;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(settle);
    };
    schedule();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
    };
  }, [open, anchor, list, contentKey]);
}

/** The nearest ancestor that scrolls vertically, or null for the page itself. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}
