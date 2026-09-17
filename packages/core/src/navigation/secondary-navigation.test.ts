import { describe, expect, it } from "vitest";

import { PRIMARY_NAVIGATION } from "./primary-navigation";
import { SECONDARY_NAVIGATION, secondaryNavigationFor } from "./secondary-navigation";

describe("the household domains", () => {
  it("never appear in the primary navigation", () => {
    // Requirements §4: do not put every household domain in bottom navigation.
    const primary = new Set(PRIMARY_NAVIGATION.map((item) => item.href));
    for (const item of SECONDARY_NAVIGATION) {
      expect(primary.has(item.href)).toBe(false);
    }
  });

  it("show a child only what a child may see", () => {
    const child = secondaryNavigationFor({ permissions: ["school.view_own"], tone: "child" });
    const keys = child.map((item) => item.key);

    expect(keys).toContain("school");
    expect(keys).toContain("settings");
    expect(keys).not.toContain("bills");
    expect(keys).not.toContain("manage");
    expect(keys).not.toContain("househelper");
    expect(keys).not.toContain("certification");
  });

  it("show an adult the money but not the administration", () => {
    const adult = secondaryNavigationFor({ permissions: ["finance.view", "school.manage", "conversation.private"], tone: "adult" });
    const keys = adult.map((item) => item.key);

    expect(keys).toContain("bills");
    expect(keys).toContain("school");
    expect(keys).not.toContain("manage");
  });

  it("show the head of family everything", () => {
    const head = secondaryNavigationFor({
      permissions: ["household.manage", "finance.view", "school.manage", "integrations.manage"],
      tone: "adult",
    });
    expect(head).toHaveLength(SECONDARY_NAVIGATION.length);
  });
});
