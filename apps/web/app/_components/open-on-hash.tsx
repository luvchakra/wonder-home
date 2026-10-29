"use client";

import { useEffect } from "react";

/** Opens a folded card when the URL points at it (`#add`), then scrolls to it — a closed `<details>` hides its anchor. */
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (target instanceof HTMLDetailsElement && !target.open) {
        target.open = true;
        target.scrollIntoView();
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
