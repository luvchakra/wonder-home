import { describe, expect, it } from "vitest";

import { childrenLine } from "./classify-intake";

describe("the reading is told the household's children at school (2026-11-21)", () => {
  it("gives each child's class and school as a role, never a name", () => {
    const line = childrenLine({ children: [{ school: "Delhi Public School", grade: "3" }, { school: "Delhi Public School", grade: null }] });
    expect(line).toContain("- Child 1: class 3 at Delhi Public School");
    expect(line).toContain("- Child 2: class not on record at Delhi Public School");
    expect(line).toMatch(/not from the content/);
  });
  it("says nothing when no child has a school or class on record", () => {
    expect(childrenLine({ children: [] })).toBe("");
    expect(childrenLine({ children: [{ school: null, grade: null }] })).toBe("");
    expect(childrenLine(undefined)).toBe("");
  });
});
