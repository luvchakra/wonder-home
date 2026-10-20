"use client";

import { useEffect } from "react";

/**
 * Brings the section a link named (`/?tab=school#coming-up`) into view once
 * the tab has rendered. A "Show me" that only switched the tab left the page
 * where it was, so the tap looked like it did nothing (the owner,
 * 2026-10-20). Keyed by the tab, it runs again on every switch; without a
 * hash it does nothing. Motion follows `prefers-reduced-motion`.
 */
export function ScrollToSection() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, []);
  return null;
}
