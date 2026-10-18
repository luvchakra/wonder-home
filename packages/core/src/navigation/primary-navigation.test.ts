import { describe, expect, it } from "vitest";

import { activeNavKey, PRIMARY_NAVIGATION } from "./primary-navigation";

describe("primary navigation", () => {
  it("exposes the five information areas from the UI spec, in order", () => {
    expect(PRIMARY_NAVIGATION.map((item) => item.key)).toEqual([
      "home",
      "calendar",
      "ai",
      "family",
      "more",
    ]);
  });

  it("treats the root path as Home", () => {
    expect(activeNavKey("/")).toBe("home");
    expect(activeNavKey("")).toBe("home");
  });

  it("keeps a nested route inside its own area rather than falling back to Home", () => {
    expect(activeNavKey("/more/bills")).toBe("more");
    expect(activeNavKey("/family/anaya")).toBe("family");
    expect(activeNavKey("/calendar/")).toBe("calendar");
  });

  it("keeps Today's plan under the Calendar tab (D1)", () => {
    expect(activeNavKey("/today")).toBe("calendar");
    expect(activeNavKey("/calendar")).toBe("calendar");
  });

  it("does not match a prefix that is only a partial segment", () => {
    expect(activeNavKey("/families")).toBe("home");
  });
});
