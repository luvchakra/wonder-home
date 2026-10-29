import { describe, expect, it } from "vitest";

import { BACK_TO_APP_HREF, PLATFORM_MENU, currentPlatformHref, platformMenuFor } from "./menu";

const staff = (role: string) => (capability: string) => role === "owner" || capability !== "careers.manage";

describe("platform-admin menu", () => {
  it("lists every section for a staff role with careers.manage", () => {
    const hrefs = platformMenuFor(staff("owner")).map((i) => i.href);
    expect(hrefs).toEqual(PLATFORM_MENU.map((e) => e.href));
  });

  it("hides items whose capability the role lacks", () => {
    const hrefs = platformMenuFor(staff("support")).map((i) => i.href);
    expect(hrefs).not.toContain("/platform-admin/careers");
    expect(hrefs).toContain("/platform-admin/performance");
  });

  it("never leaks the capability into the client items", () => {
    for (const item of platformMenuFor(staff("owner"))) expect(item).not.toHaveProperty("capability");
  });

  it("highlights the right item for each route, nested included", () => {
    const items = PLATFORM_MENU;
    expect(currentPlatformHref("/platform-admin", items)).toBe("/platform-admin");
    expect(currentPlatformHref("/platform-admin/performance", items)).toBe("/platform-admin/performance");
    expect(currentPlatformHref("/platform-admin/careers/key", items)).toBe("/platform-admin/careers");
    expect(currentPlatformHref("/platform-admin/performance?x=1", items)).toBe("/platform-admin/performance");
    expect(currentPlatformHref("/today", items)).toBeUndefined();
  });

  it("backs out to the household app", () => {
    expect(BACK_TO_APP_HREF).toBe("/");
  });
});
