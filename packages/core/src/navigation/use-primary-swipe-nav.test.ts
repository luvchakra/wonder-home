import { describe, expect, it } from "vitest";

import { resolveSwipeTarget } from "./use-primary-swipe-nav";

describe("resolveSwipeTarget", () => {
  it("moves to the next primary area on a leftward swipe", () => {
    expect(resolveSwipeTarget({ active: "home", dx: -120, dy: 0, elapsedMs: 200, eligible: true })).toBe("/today");
  });

  it("moves to the previous primary area on a rightward swipe", () => {
    expect(resolveSwipeTarget({ active: "family", dx: 120, dy: 0, elapsedMs: 200, eligible: true })).toBe("/ai");
  });

  it("does nothing past either end of the sequence", () => {
    expect(resolveSwipeTarget({ active: "home", dx: 120, dy: 0, elapsedMs: 200, eligible: true })).toBeNull();
    expect(resolveSwipeTarget({ active: "more", dx: -120, dy: 0, elapsedMs: 200, eligible: true })).toBeNull();
  });

  it("ignores a drag that never reached the minimum distance", () => {
    expect(resolveSwipeTarget({ active: "home", dx: -30, dy: 0, elapsedMs: 200, eligible: true })).toBeNull();
  });

  it("ignores a mostly-vertical gesture (a scroll, not a swipe)", () => {
    expect(resolveSwipeTarget({ active: "home", dx: -100, dy: 90, elapsedMs: 200, eligible: true })).toBeNull();
  });

  it("ignores a slow drag that took too long to be a deliberate swipe", () => {
    expect(resolveSwipeTarget({ active: "home", dx: -120, dy: 0, elapsedMs: 900, eligible: true })).toBeNull();
  });

  it("defers to a form, an editable field, or a scroller that claimed the gesture", () => {
    expect(resolveSwipeTarget({ active: "home", dx: -120, dy: 0, elapsedMs: 200, eligible: false })).toBeNull();
  });
});
