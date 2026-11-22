import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The 2026-11-22 "Log out does nothing" defect: a <form action={signOut}> inside a Radix
 * DropdownMenu.Item is unmounted when the menu closes on select, before the browser submits it,
 * so no POST is ever sent. Sign-out runs from the item's onSelect instead (e2e/sign-out.spec.ts
 * drives it in a browser).
 */
const source = readFileSync(new URL("./viewer-menu-content.tsx", import.meta.url), "utf8");

describe("avatar menu Log out", () => {
  it("never puts a form inside a menu item", () => {
    expect(source).not.toMatch(/<form\b/);
  });

  it("runs the sign-out server action from the item's onSelect", () => {
    expect(source).toMatch(/onSelect=\{\(event\) => \{\s*event\.preventDefault\(\);\s*startSignOut\(async \(\) => \{\s*await signOut\(\);/);
  });
});
