import { describe, expect, it } from "vitest";

import { formText, formUuid } from "./form-input";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

describe("form-input", () => {
  it("accepts a UUID and refuses anything else", () => {
    const id = "5b0f3f0e-8f6e-4c0a-9d33-0f1f3f6a1b2c";
    expect(formUuid(form({ householdId: id }), "householdId")).toBe(id);
    expect(formUuid(form({ householdId: "1; drop table" }), "householdId")).toBeNull();
    expect(formUuid(form({}), "householdId")).toBeNull();
  });
  it("caps text and trims it", () => {
    expect(formText(form({ k: "  hi " }), "k", 10)).toBe("hi");
    expect(formText(form({}), "k", 10)).toBe("");
    expect(formText(form({ k: "x".repeat(11) }), "k", 10)).toBeNull();
  });
});
