import { describe, expect, it } from "vitest";

import { sameSitePath } from "./same-site-path";

describe("sameSitePath", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(sameSitePath("/calendar")).toBe("/calendar");
    expect(sameSitePath("/invite/abc?from=email#top")).toBe("/invite/abc?from=email#top");
    expect(sameSitePath("/%5Cnot-a-backslash")).toBe("/%5Cnot-a-backslash");
  });

  it("refuses every way of naming another site", () => {
    for (const value of ["//evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "javascript:alert(1)", ""]) {
      expect(sameSitePath(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("refuses anything that is not a string, and anything too long", () => {
    expect(sameSitePath(null)).toBeNull();
    expect(sameSitePath(42)).toBeNull();
    expect(sameSitePath(`/${"a".repeat(300)}`, 200)).toBeNull();
  });
});
