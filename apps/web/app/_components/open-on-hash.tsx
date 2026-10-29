"use client";

import { useEffect } from "react";

/**
 * Opens a folded card when the URL points at it (`#add`), then scrolls to it —
 * a closed `<details>` hides its anchor. The target itself is opened when it is
 * a fold, and so is every `<details>` that contains it, so a hash that lands
 * inside a collapsed section (e.g. `#playbook` inside the Manage household card)
 * still reveals it.
 */
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (!target) return;
      let node: HTMLElement | null = target;
      while (node) {
        if (node instanceof HTMLDetailsElement && !node.open) node.open = true;
        node = node.parentElement;
      }
      target.scrollIntoView();
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
