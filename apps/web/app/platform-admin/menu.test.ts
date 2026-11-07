import { describe, expect, it } from "vitest";

import { platformCan, type PlatformRole } from "@wonderhome/core/platform/admin";

import { BACK_TO_APP_HREF, PLATFORM_MENU, currentPlatformHref, groupedMenu, platformMenuFor } from "./menu";

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

  it("shows each role only what it may open", () => {
    const menu = (role: PlatformRole) => platformMenuFor((capability) => platformCan({ profileId: "p", role }, capability)).map((i) => i.href);
    expect(menu("owner")).toEqual(PLATFORM_MENU.map((e) => e.href));
    expect(menu("operator")).not.toContain("/platform-admin/secrets");
    expect(menu("operator")).toContain("/platform-admin/configuration");
    expect(menu("support")).not.toContain("/platform-admin/plans");
    expect(menu("support")).not.toContain("/platform-admin/security");
  });

  it("groups the sections under Run, Configure and Guard, Overview first", () => {
    const groups = groupedMenu(PLATFORM_MENU).map((g) => g.group);
    expect(groups).toEqual([null, "Run", "Configure", "Guard"]);
    expect(groupedMenu(PLATFORM_MENU)[0]?.items.map((i) => i.href)).toEqual(["/platform-admin"]);
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
