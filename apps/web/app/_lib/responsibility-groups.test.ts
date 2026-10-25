import { describe, expect, it } from "vitest";

import { groupByArea, groupByOwner, sharedMode, type Row } from "./responsibility-groups";

function row(over: Partial<Row>): Row {
  return {
    id: over.outcome_key ?? "x",
    outcome_key: "home.cleaning",
    primary_member_id: null,
    backup_member_id: null,
    ai_mode: "prepare",
    priority: 3,
    playbook_items: null,
    ...over,
  };
}

// The translator the page uses, with the area names it would show.
const t = ((key: string) => (key.startsWith("manage.resp.area.") ? key.replace("manage.resp.area.", "AREA:") : key)) as Parameters<typeof groupByArea>[1];

describe("groupByArea", () => {
  it("groups by the part of the outcome key before the dot, in first-appearance order", () => {
    const groups = groupByArea(
      [row({ outcome_key: "laundry.ready" }), row({ outcome_key: "meals.dinner_ready" }), row({ outcome_key: "laundry.folded" })],
      t,
    );
    expect(groups.map((group) => group.ownerName)).toEqual(["AREA:laundry", "AREA:meals"]);
    expect(groups[0]!.rows.map((r) => r.outcome_key)).toEqual(["laundry.ready", "laundry.folded"]);
  });

  it("shows an area it does not know as written, with underscores as spaces", () => {
    const [group] = groupByArea([row({ outcome_key: "garden_tools.shed" })], t);
    expect(group!.ownerName).toBe("garden tools");
  });
});

describe("groupByOwner", () => {
  it("follows household member order and puts unowned outcomes last", () => {
    const members = [
      { id: "m1", displayName: "Asha" },
      { id: "m2", displayName: "Ravi" },
    ];
    const groups = groupByOwner(
      [row({ outcome_key: "a.one", primary_member_id: "m2" }), row({ outcome_key: "b.two", primary_member_id: null }), row({ outcome_key: "c.three", primary_member_id: "m1" })],
      members,
      "Nobody yet",
    );
    expect(groups.map((group) => group.ownerName)).toEqual(["Asha", "Ravi", "Nobody yet"]);
  });

  it("leaves out a member with no responsibilities", () => {
    const groups = groupByOwner([row({ primary_member_id: "m1" })], [{ id: "m1", displayName: "Asha" }, { id: "m2", displayName: "Ravi" }], "Nobody yet");
    expect(groups.map((group) => group.ownerName)).toEqual(["Asha"]);
  });
});

describe("sharedMode", () => {
  it("returns the one mode every responsibility shares", () => {
    expect(sharedMode([row({ ai_mode: "prepare" }), row({ ai_mode: "prepare" })])).toBe("prepare");
  });

  it("returns null when the group's modes differ, so no option shows as chosen", () => {
    expect(sharedMode([row({ ai_mode: "prepare" }), row({ ai_mode: "execute" })])).toBeNull();
  });

  it("returns null for an empty group", () => {
    expect(sharedMode([])).toBeNull();
  });
});
