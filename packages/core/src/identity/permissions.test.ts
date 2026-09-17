import { describe, expect, it } from "vitest";

import { can, canAssignRole, permissionsFor, PERMISSIONS } from "./permissions";

describe("permissions", () => {
  it("gives the head everything, including designating administrators", () => {
    const head = { roles: ["head" as const] };
    expect(can(head, "members.assign_admin")).toBe(true);
    expect(permissionsFor(head).size).toBe(Object.keys(PERMISSIONS).length - 1); // school.view_own is the child's
  });

  it("differs from head to administrator in exactly one permission", () => {
    const head = permissionsFor({ roles: ["head"] });
    const admin = permissionsFor({ roles: ["administrator"] });
    const difference = [...head].filter((permission) => !admin.has(permission));
    expect(difference).toEqual(["members.assign_admin"]);
  });

  it("denies a child the household's money, administration and other people's privacy", () => {
    const child = { roles: ["child" as const], memberType: "child" as const };
    expect(can(child, "finance.view")).toBe(false);
    expect(can(child, "finance.pay")).toBe(false);
    expect(can(child, "members.manage")).toBe(false);
    expect(can(child, "conversation.private")).toBe(false);
    expect(can(child, "audit.view")).toBe(false);
  });

  it("lets a child see their own school work and no one else's", () => {
    const child = { roles: ["child" as const] };
    expect(can(child, "school.view_own")).toBe(true);
    expect(can(child, "school.manage")).toBe(false);
  });

  it("grants a helper nothing by default", () => {
    expect(permissionsFor({ roles: ["helper"] }).size).toBe(0);
  });

  it("denies everything to a member with no role at all", () => {
    expect(permissionsFor({ roles: [] }).size).toBe(0);
  });

  it("honours an explicit grant beyond the role default", () => {
    const helper = { roles: ["helper" as const], extraGrants: ["school.view_own" as const] };
    expect(can(helper, "school.view_own")).toBe(true);
    expect(can(helper, "finance.view")).toBe(false);
  });

  it("lets an adult see finances but never pay", () => {
    const adult = { roles: ["adult" as const] };
    expect(can(adult, "finance.view")).toBe(true);
    expect(can(adult, "finance.pay")).toBe(false);
  });

  it("allows only the head to assign the administrator role", () => {
    expect(canAssignRole({ roles: ["head"] }, "administrator")).toBe(true);
    expect(canAssignRole({ roles: ["administrator"] }, "administrator")).toBe(false);
    expect(canAssignRole({ roles: ["adult"] }, "administrator")).toBe(false);
  });

  it("never treats head as an assignable role", () => {
    // Ownership transfer is its own operation, not a role grant.
    expect(canAssignRole({ roles: ["head"] }, "head")).toBe(false);
  });

  it("lets an administrator assign ordinary roles", () => {
    expect(canAssignRole({ roles: ["administrator"] }, "adult")).toBe(true);
    expect(canAssignRole({ roles: ["administrator"] }, "child")).toBe(true);
    expect(canAssignRole({ roles: ["adult"] }, "child")).toBe(false);
  });

  it("documents every permission it defines", () => {
    for (const [name, description] of Object.entries(PERMISSIONS)) {
      expect(description, `${name} needs a description`).toBeTruthy();
    }
  });
});
