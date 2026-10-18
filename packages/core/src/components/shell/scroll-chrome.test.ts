import { describe, expect, it } from "vitest";

import { HIDE_BOTTOM_AFTER, HIDE_TOP_AFTER, nextChrome } from "./scroll-chrome";

const at = (y: number, travelled: number, atEnd = false) => nextChrome({ y, travelled, atEnd, headerHeight: 56 });

describe("hiding the bars on scroll", () => {
  it("hides the top bar first, then the tab bar as the person keeps reading down", () => {
    expect(at(400, HIDE_TOP_AFTER - 1)).toBeNull();
    expect(at(400, HIDE_TOP_AFTER)).toBe("top-hidden");
    expect(at(400, HIDE_BOTTOM_AFTER - 1)).toBe("top-hidden");
    expect(at(400, HIDE_BOTTOM_AFTER)).toBe("all-hidden");
  });

  it("brings both back on a small scroll up, at the top, and at the very end", () => {
    expect(at(400, -12)).toBe("shown");
    expect(at(40, 200)).toBe("shown");
    expect(at(2000, 200, true)).toBe("shown");
  });
});
