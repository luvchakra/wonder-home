import { describe, expect, it } from "vitest";

import { namesGrade } from "./memory-resolve";

describe("a notice that names a child's class (resolvePerson, 2026-11-21)", () => {
  it("matches roman and arabic numerals either way, with or without a section", () => {
    expect(namesGrade("Std. III students will visit the museum", "3")).toBe(true);
    expect(namesGrade("Class 4-B parents meeting", "IV-B")).toBe(true);
    expect(namesGrade("Grade 5B sports day", "5")).toBe(true);
    expect(namesGrade("class V picnic", "Grade 5")).toBe(true);
  });
  it("never matches another class, another section, or a word that only starts like a numeral", () => {
    expect(namesGrade("Class 4-A parents meeting", "4B")).toBe(false);
    expect(namesGrade("Std. III students", "4")).toBe(false);
    expect(namesGrade("class visit on Friday", "6")).toBe(false);
    expect(namesGrade("Class 12 boards", "1")).toBe(false);
  });
});
