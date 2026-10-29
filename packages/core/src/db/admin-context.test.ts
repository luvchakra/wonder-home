import { describe, expect, it, vi } from "vitest";

vi.mock("./admin", () => ({ createAdminClient: () => ({ service: true }) }));

import type { HouseholdMembership } from "../identity/schemas";
import { AdminGrantScopeError, adminClientFor, adminGrant, assertGrantCovers } from "./admin-context";

const membership = (roles: string[], householdId = "h1") =>
  ({ household: { id: householdId }, memberId: "m1", roles }) as unknown as HouseholdMembership;

describe("adminGrant", () => {
  it("scopes a member grant to the membership's household", () => {
    const grant = adminGrant.member(membership(["adult"]), "record an event");
    expect(grant).toMatchObject({ kind: "household-member", householdId: "h1", subject: "m1" });
    expect(Object.isFrozen(grant)).toBe(true);
  });

  it("refuses an Admin grant for a member who is not an Admin", () => {
    expect(() => adminGrant.householdAdmin(membership(["adult"]), "x")).toThrow(/not an Admin/);
    expect(adminGrant.householdAdmin(membership(["administrator"]), "x").kind).toBe("household-admin");
  });

  it("requires a purpose", () => {
    expect(() => adminGrant.platformAdmin({ profileId: "p", role: "support" }, " ")).toThrow(/purpose/);
  });
});

describe("adminClientFor", () => {
  it("hands out the service client for a grant", () => {
    expect(adminClientFor(adminGrant.member(membership(["adult"]), "x"))).toEqual({ service: true });
  });

  it("refuses a grant pointed at another household", () => {
    const grant = adminGrant.member(membership(["adult"], "h1"), "x");
    expect(() => adminClientFor(grant, "h2")).toThrow(AdminGrantScopeError);
    expect(adminClientFor(grant, "h1")).toEqual({ service: true });
  });

  it("lets a cross-household grant through for any household", () => {
    expect(() => assertGrantCovers(adminGrant.platformAdmin({ profileId: "p", role: "owner" }, "x"), "h9")).not.toThrow();
    expect(() => assertGrantCovers(adminGrant.worker("retention", "x"), "h9")).not.toThrow();
  });
});
