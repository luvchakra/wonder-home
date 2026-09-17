import { describe, expect, it } from "vitest";

import { redirectFor, routeRequirement } from "./route-policy";

describe("route policy", () => {
  it("treats household surfaces as authenticated", () => {
    expect(routeRequirement("/today")).toBe("authenticated");
    expect(routeRequirement("/family/anaya")).toBe("authenticated");
    expect(routeRequirement("/more/bills")).toBe("authenticated");
  });

  it("gates onboarding, which needs an authenticated creator", () => {
    expect(routeRequirement("/welcome")).toBe("authenticated");
  });

  it("keeps the platform admin boundary separate from household roles", () => {
    expect(routeRequirement("/platform-admin")).toBe("platform-admin");
    expect(routeRequirement("/platform-admin/households")).toBe("platform-admin");
  });

  it("sends an anonymous caller to sign-in, preserving where they were going", () => {
    expect(redirectFor("/today", false)).toEqual({
      redirectTo: "/sign-in?next=%2Ftoday",
    });
  });

  it("does not reveal the admin boundary to an anonymous caller", () => {
    expect(redirectFor("/platform-admin/households", false)).toEqual({ redirectTo: "/" });
  });

  it("keeps a signed-in member out of the sign-in screen", () => {
    expect(redirectFor("/sign-in", true)).toEqual({ redirectTo: "/" });
    expect(redirectFor("/sign-in", false)).toBeNull();
  });

  it("leaves public surfaces alone in both directions", () => {
    expect(redirectFor("/", true)).toBeNull();
    expect(redirectFor("/", false)).toBeNull();
  });

  it("does not match a prefix that is only part of a segment", () => {
    expect(routeRequirement("/families")).toBe("public");
  });
});
