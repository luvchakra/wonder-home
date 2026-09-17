import { describe, expect, it } from "vitest";

import { toMembership } from "./households";

const household = {
  id: "h-1",
  name: "Chakraborty Home",
  timezone: "Asia/Kolkata",
  status: "active" as const,
  owner_member_id: "m-1",
};

describe("membership mapping", () => {
  it("maps a to-one embed returned as an object", () => {
    expect(
      toMembership({
        id: "m-1",
        display_name: "Kunal",
        member_type: "adult",
        households: household,
        household_roles: [{ role: "head" }],
      }),
    ).toEqual([
      {
        memberId: "m-1",
        displayName: "Kunal",
        memberType: "adult",
        roles: ["head"],
        household: {
          id: "h-1",
          name: "Chakraborty Home",
          timezone: "Asia/Kolkata",
          status: "active",
          ownerMemberId: "m-1",
        },
      },
    ]);
  });

  it("maps the same embed when the client returns it as an array", () => {
    const [mapped] = toMembership({
      id: "m-1",
      display_name: "Kunal",
      member_type: "adult",
      households: [household],
      household_roles: [{ role: "head" }],
    });
    expect(mapped?.household.name).toBe("Chakraborty Home");
  });

  it("drops a membership whose household is not readable rather than inventing one", () => {
    expect(
      toMembership({
        id: "m-1",
        display_name: "Kunal",
        member_type: "adult",
        households: null,
        household_roles: [{ role: "head" }],
      }),
    ).toEqual([]);
  });

  it("reports a member with no roles as having none, not a default role", () => {
    const [mapped] = toMembership({
      id: "m-2",
      display_name: "Anaya",
      member_type: "child",
      households: household,
      household_roles: null,
    });
    expect(mapped?.roles).toEqual([]);
  });
});
