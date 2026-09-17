import { describe, expect, it } from "vitest";

import { initialsOf, tintFor } from "./avatar";

describe("avatars", () => {
  it("takes the first letters of the first and last name", () => {
    expect(initialsOf("Kunal Chakraborty")).toBe("KC");
    expect(initialsOf("Priya")).toBe("PR");
    expect(initialsOf("  Anaya  Rao ")).toBe("AR");
    expect(initialsOf("")).toBe("?");
  });

  it("gives the same person the same tint on every screen", () => {
    expect(tintFor("Kunal Chakraborty")).toBe(tintFor("Kunal Chakraborty"));
  });

  it("only ever picks a tint that sits on the cream page", () => {
    // Every tint is a domain soft/strong pair, so text always has contrast.
    for (const name of ["a", "Priya", "Sunita", "Mochi", "Aarav", "Kunal Chakraborty"]) {
      expect(tintFor(name)).toMatch(/^bg-\[var\(--wh-tone-\w+-soft\)\] text-\[var\(--wh-tone-\w+\)\]$/);
    }
  });
});
