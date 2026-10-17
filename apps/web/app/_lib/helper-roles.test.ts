import { describe, expect, it } from "vitest";

import { helperRolesFrom, splitHelperRoles } from "./helper-roles";

describe("a househelper's roles", () => {
  it("keeps everything ticked plus their own words, once each", () => {
    const form = new FormData();
    form.append("helperRoles", "Maid");
    form.append("helperRoles", "Cook");
    form.append("helperRoles_other", "Plant care, cook");
    expect(helperRolesFrom(form, "helperRoles")).toBe("Maid, Cook, Plant care");
  });

  it("is nothing when nothing is ticked", () => {
    expect(helperRolesFrom(new FormData(), "helperRoles")).toBeNull();
  });

  it("splits what was kept back into ticks and their own words", () => {
    expect(splitHelperRoles("Maid, Cook, Plant care")).toEqual({ known: ["Maid", "Cook"], other: "Plant care" });
    expect(splitHelperRoles(null)).toEqual({ known: [], other: "" });
  });
});
