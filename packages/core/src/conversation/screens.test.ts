import { describe, expect, it } from "vitest";

import { permissionsFor } from "../identity/permissions";
import { PRIMARY_NAVIGATION } from "../navigation/primary-navigation";
import { SECONDARY_NAVIGATION } from "../navigation/secondary-navigation";
import { SCREEN_KEYS, SCREENS, openScreenReply, readOpenScreen, screenFor, screenNamed } from "./screens";

const adult = { permissions: [...permissionsFor({ roles: ["head"], memberType: "adult" })], tone: "adult" as const };
const child = { permissions: [...permissionsFor({ roles: ["child"], memberType: "child" })], tone: "child" as const };

describe("the screens HomeTalk can open", () => {
  it("has one entry per key, each a real screen of the app", () => {
    expect(SCREENS.map((screen) => screen.key)).toEqual([...SCREEN_KEYS]);
    const known = new Set([...PRIMARY_NAVIGATION.map((item) => item.href), ...SECONDARY_NAVIGATION.map((item) => item.href), "/today", "/help"]);
    for (const screen of SCREENS) expect(known, screen.key).toContain(screen.href);
  });

  it("never gives one phrase to two screens", () => {
    const words = SCREENS.flatMap((screen) => screen.words);
    expect(new Set(words).size).toBe(words.length);
  });
});

describe("reading a request to open a screen", () => {
  it.each([
    ["Take me to the grocery list", "groceries"],
    ["take me to groceries", "groceries"],
    ["Go to the shopping list", "groceries"],
    ["open the calendar", "calendar"],
    ["open up the calendar page", "calendar"],
    ["go back to HomeTalk", "hometalk"],
    ["take me back to the conversation", "hometalk"],
    ["switch to responsibilities", "responsibilities"],
    ["navigate to the family screen", "family"],
    ["show me the grocery list", "groceries"],
    ["show me the meals page", "meals"],
    ["go home", "home"],
    ["take me home", "home"],
    ["Open today's plan", "today"],
    ["open settings", "settings"],
    ["bring up the househelper page", "househelper"],
  ])("%s → %s", (said, key) => {
    expect(readOpenScreen(said)).toBe(key);
  });

  it.each([
    "show me tomorrow's schedule",
    "show me the bills",
    "what's on the grocery list",
    "open the door",
    "go to the market",
    "take me to school tomorrow",
    "open",
  ])("leaves %s alone", (said) => {
    expect(readOpenScreen(said)).toBeNull();
  });

  it("names a screen only by a whole phrase", () => {
    expect(screenNamed("the grocery list screen")?.key).toBe("groceries");
    expect(screenNamed("grocery list for tomorrow")).toBeNull();
  });
});

describe("what HomeTalk says, and where it goes", () => {
  it("opens the screen and says so", () => {
    expect(openScreenReply("groceries", { viewer: adult, hasScreen: true })).toEqual({ text: "Opening Groceries.", navigate: "/groceries" });
    expect(openScreenReply("hometalk", { viewer: child, hasScreen: true })).toEqual({ text: "Opening HomeTalk.", navigate: "/ai" });
  });

  it("never opens a screen this person is not offered", () => {
    expect(openScreenReply("bills", { viewer: child, hasScreen: true })).toEqual({ text: "Bills & Finance isn't one of your screens, so I've stayed here.", navigate: null });
    expect(openScreenReply("groceries", { viewer: child, hasScreen: true }).navigate).toBeNull();
  });

  it("a speaker with no screen says where to find it", () => {
    expect(openScreenReply("calendar", { viewer: adult, hasScreen: false })).toEqual({ text: "There's no screen here to show Calendar on. Open it in the WonderHome app.", navigate: null });
  });

  it("an unknown screen is a question, never a path", () => {
    expect(openScreenReply("../admin", { viewer: adult, hasScreen: true }).navigate).toBeNull();
    expect(screenFor("../admin")).toBeNull();
  });
});
