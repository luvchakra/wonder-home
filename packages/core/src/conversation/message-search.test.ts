import { describe, expect, it } from "vitest";

import { messageSearchPattern } from "./repository";

describe("searching a member's messages", () => {
  it("matches the words anywhere in a message", () => {
    expect(messageSearchPattern("coriander")).toBe("%coriander%");
    expect(messageSearchPattern("  school   work ")).toBe("%school work%");
  });

  it("takes the pattern's own wildcards literally", () => {
    expect(messageSearchPattern("50%")).toBe("%50\\%%");
    expect(messageSearchPattern("a_b")).toBe("%a\\_b%");
    expect(messageSearchPattern("back\\slash")).toBe("%back\\\\slash%");
  });

  it("does not search for nothing, or a single letter", () => {
    expect(messageSearchPattern("")).toBeNull();
    expect(messageSearchPattern("  a ")).toBeNull();
  });

  it("keeps a search to a reasonable length", () => {
    expect(messageSearchPattern("x".repeat(500))).toBe(`%${"x".repeat(100)}%`);
  });
});
