import { describe, expect, it } from "vitest";

import { backTarget } from "./back-target";

describe("the header back arrow", () => {
  it.each([
    ["/household/responsibilities", "/more"],
    ["/school", "/more"],
    ["/groceries", "/more"],
    ["/meals", "/more"],
    ["/bills", "/more"],
    ["/househelper", "/more"],
    ["/health", "/more"],
    ["/home-send", "/more"],
    ["/places", "/more"],
    ["/settings", "/more"],
    ["/settings/profile", "/more"],
    ["/help", "/more"],
    ["/about", "/more"],
    ["/chat", "/more"],
    ["/notifications", "/"],
  ])("takes first-level %s Home", (pathname, explicit) => {
    expect(backTarget({ pathname, explicit })).toBe("/");
  });

  it.each([
    ["/settings/notifications", "/settings", "/settings"],
    ["/meals/recipes/mine/abc", "/meals?tab=recipes", "/meals?tab=recipes"],
    ["/chat/abc", "/chat", "/chat"],
    ["/settings/plan", "/settings/plan/billing", "/settings/plan/billing"],
  ])("takes nested %s to its named parent", (pathname, explicit, expected) => {
    expect(backTarget({ pathname, explicit })).toBe(expected);
  });

  it("derives a parent from the path when none is named", () => {
    expect(backTarget({ pathname: "/chat/abc" })).toBe("/chat");
    expect(backTarget({ pathname: "/settings/plan/billing" })).toBe("/settings/plan");
    expect(backTarget({ pathname: "/school" })).toBe("/");
  });

  it("falls back to Home for unknown or unsafe input", () => {
    expect(backTarget({})).toBe("/");
    expect(backTarget({ pathname: "//evil.example" })).toBe("/");
    expect(backTarget({ pathname: "/x", explicit: "//evil.example" })).toBe("/");
    expect(backTarget({ pathname: "garbage", explicit: "https://evil.example" })).toBe("/");
  });
});
