import { describe, expect, it } from "vitest";
import { currentNavHref } from "./current-nav";
import { SECONDARY_NAVIGATION } from "./secondary-navigation";

const keyAt = (pathname: string) => SECONDARY_NAVIGATION.find((i) => i.href === currentNavHref(pathname, SECONDARY_NAVIGATION))?.key;

describe("currentNavHref", () => {
  it.each([
    ["/settings", "settings"],
    ["/settings?tab=household", "settings"],
    ["/settings/assistant", "settings"],
    ["/settings/profile", undefined],
    ["/settings/profile/", undefined],
    ["/meals", "meals"],
    ["/meals?tab=recipes", "meals"],
    ["/meals/recipes/42", "meals"],
    ["/household/home", "upkeep"],
    ["/household/responsibilities/x", "responsibilities"],
    ["/home-send", "homesend"],
    ["/ai", undefined],
    ["/family", undefined],
    ["/help", undefined],
    ["/", undefined],
    [undefined, undefined],
  ])("%s -> %s", (pathname, key) => {
    expect(keyAt(pathname as string)).toBe(key);
  });

  it("longest match wins over a parent", () => {
    const items = [{ href: "/a" }, { href: "/a/b" }];
    expect(currentNavHref("/a/b/c", items)).toBe("/a/b");
    expect(currentNavHref("/a/x", items)).toBe("/a");
  });
});
