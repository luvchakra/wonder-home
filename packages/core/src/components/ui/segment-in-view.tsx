"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the current tab of a `SegmentedControl` in view (rule 15): on a phone
 * the row scrolls sideways when its tabs need more room than the screen, and
 * the tab you are on is never left hidden past the edge. Runs once, on arrival.
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
  return <span ref={ref} hidden />;
}
