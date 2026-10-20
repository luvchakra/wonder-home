"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the current tab of a `SegmentedControl` in view (rule 15): on a phone
 * the row scrolls sideways when its tabs need more room than the screen, and
 * the tab you are on is never left hidden past the edge.
 *
 * And a tab tapped brings its row to the top of the screen (the owner,
 * 2026-10-20: "if a tab is clicked, the entire page should auto scroll and tab
 * row should scroll to top"), so what the tab opens starts right under it
 * rather than below the fold. The row's `scroll-margin-top` keeps it clear of
 * the header; reduced motion jumps instead of gliding.
 */
export function SegmentInView() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = ref.current?.closest("nav");
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const start = current.offsetLeft;
    const end = start + current.offsetWidth;
    if (end > nav.scrollLeft + nav.clientWidth || start < nav.scrollLeft) {
      nav.scrollLeft = Math.max(0, start - (nav.clientWidth - current.offsetWidth) / 2);
    }
  }, []);

  useEffect(() => {
    const nav = ref.current?.closest("nav");
    if (!nav) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const toTop = () => nav.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    const onClick = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest("a")) return;
      // Now, and again once the tab's content has arrived and the page is long enough to scroll that far.
      toTop();
      timers.push(window.setTimeout(toTop, 350), window.setTimeout(toTop, 900));
    };
    nav.addEventListener("click", onClick);
    return () => {
      nav.removeEventListener("click", onClick);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  return <span ref={ref} hidden />;
}
