import { describe, expect, it } from "vitest";

import { appPath, screenShowing } from "./app-path";

describe("where HomeTalk may take a person", () => {
  it("is one of WonderHome's own screens, with a plain query at most", () => {
    expect(appPath("/groceries?view=to-buy")).toBe("/groceries?view=to-buy");
    expect(appPath("/calendar")).toBe("/calendar");
    expect(appPath("//evil.example")).toBeNull();
    expect(appPath("https://evil.example")).toBeNull();
    expect(appPath("/groceries?x=<script>")).toBeNull();
    expect(appPath(null)).toBeNull();
  });

  it("after a change, is the first screen its reply links to", () => {
    expect(screenShowing("Added **Tomato** (1 kg) to the [shopping list](/groceries?view=to-buy). Say undo to take it back.")).toBe("/groceries?view=to-buy");
    expect(screenShowing("See [the map](https://maps.example/x) or [Places](/places).")).toBe("/places");
    expect(screenShowing("Done.")).toBeNull();
  });
});
