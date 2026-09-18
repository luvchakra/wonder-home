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

  it("sends an invitee to sign in and back to the invitation link", () => {
    expect(routeRequirement("/invite/abc123")).toBe("authenticated");
    expect(redirectFor("/invite/abc123", false)).toEqual({
      redirectTo: "/sign-in?next=%2Finvite%2Fabc123",
    });
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

  it("lets an anonymous visitor ask for a password reset, and keeps a signed-in one away", () => {
    expect(redirectFor("/forgot-password", false)).toBeNull();
    expect(redirectFor("/forgot-password", true)).toEqual({ redirectTo: "/" });
  });

  it("lets the reset form and the auth callback through either way", () => {
    // Both are reached carrying a one-time code, and the callback turns that
    // code into a session — so a signed-out visitor must not be bounced to
    // sign-in before the link can be used, and a signed-in one (the callback
    // has just signed them in) must not be bounced home before the form.
    for (const path of ["/reset-password", "/auth/callback"]) {
      expect(redirectFor(path, false), `${path} signed out`).toBeNull();
      expect(redirectFor(path, true), `${path} signed in`).toBeNull();
    }
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
