"use client";

import { useEffect } from "react";

/**
 * Opens a folded card when the URL points at it (`#add`), then scrolls to it —
 * a closed `<details>` hides its anchor. The target itself is opened when it is
 * a fold, and so is every `<details>` that contains it, so a hash that lands
 * inside a collapsed section (e.g. `#playbook` inside the Manage household card)
 * still reveals it. It then focuses the setting and flashes it briefly (settings search lands here).
 */
const FOCUSABLE = "input:not([type=hidden]), select, textarea, button[role=switch], [role=switch]";

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
      target.scrollIntoView({ block: "center" });
      // A setting reached from search: focus the control (not a fold, whose summary needs no
      // focus) and flash the row so the eye finds it.
      const control = target instanceof HTMLDetailsElement ? null : target.matches(FOCUSABLE) ? target : target.querySelector<HTMLElement>(FOCUSABLE);
      if (control && !control.hasAttribute("disabled")) control.focus({ preventScroll: true });
      target.setAttribute("data-hash-flash", "");
      window.setTimeout(() => target.removeAttribute("data-hash-flash"), 2200);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
