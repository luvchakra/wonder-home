import { describe, expect, it } from "vitest";

import { siblingOrder, toMembership, type HouseholdMember } from "./households";

function member(over: Partial<HouseholdMember> & Pick<HouseholdMember, "id" | "displayName">): HouseholdMember {
  return {
    memberType: "child",
    status: "active",
    roles: [],
    isOwner: false,
    dateOfBirth: null,
    nickname: null,
    relationship: null,
    occupation: null,
    schoolOrWorkLocation: null,
    specialOccasionLabel: null,
    specialOccasionDate: null,
    avatarUrl: null,
    ...over,
  };
}

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
        dateOfBirth: null,
        firstSeenAt: null,
        adminSince: null,
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

describe("siblingOrder", () => {
  const anaya = member({ id: "anaya", displayName: "Anaya", dateOfBirth: "2015-03-10" });
  const kabir = member({ id: "kabir", displayName: "Kabir", dateOfBirth: "2018-07-04" });
  const parent = member({ id: "kunal", displayName: "Kunal", memberType: "adult", dateOfBirth: "1985-01-01" });

  it("names the younger sibling for the elder", () => {
    expect(siblingOrder(anaya, [anaya, kabir, parent])).toBe("Older sibling of Kabir");
  });

  it("names the elder sibling for the younger", () => {
    expect(siblingOrder(kabir, [anaya, kabir, parent])).toBe("Younger sibling of Anaya");
  });

  it("says nothing about an only child", () => {
    expect(siblingOrder(anaya, [anaya, parent])).toBeNull();
  });

  it("says nothing when this member's own birthdate is unknown", () => {
    const noBirthdate = member({ id: "anaya", displayName: "Anaya", dateOfBirth: null });
    expect(siblingOrder(noBirthdate, [noBirthdate, kabir])).toBeNull();
  });

  it("skips a sibling whose birthdate is unknown rather than guessing their order", () => {
    const noBirthdate = member({ id: "kabir", displayName: "Kabir", dateOfBirth: null });
    expect(siblingOrder(anaya, [anaya, noBirthdate])).toBeNull();
  });

  it("names both directions when there are siblings on either side", () => {
    const youngest = member({ id: "riya", displayName: "Riya", dateOfBirth: "2021-01-01" });
    expect(siblingOrder(kabir, [anaya, kabir, youngest])).toBe("Older sibling of Riya · Younger sibling of Anaya");
  });

  it("never compares against an adult, even with a birthdate on file", () => {
    expect(siblingOrder(anaya, [anaya, parent])).toBeNull();
  });
});
