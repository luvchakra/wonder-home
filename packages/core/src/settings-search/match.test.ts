import { describe, expect, it } from "vitest";

import { highlight, searchSettings, withinOneEdit, type SearchItem } from "./match";

const item = (id: string, label: string, keywords = "", extra: Partial<SearchItem> = {}): SearchItem => ({ id, label, crumbs: [], keywords, href: `/settings#${id}`, ...extra });

const items = [
  item("speed", "Speaking speed", "pace, fast, slow", { crumbs: ["Assistant & voice", "Voice"] }),
  item("region", "Language & region", "currency, rupee, time zone"),
  item("mute", "Notifications", "mute, quiet, silence"),
  item("delete", "Privacy", "delete account, erase", { description: "Export or delete your data" }),
  item("security", "Sign-in & security", "password, sign in"),
  item("hi", "भाषा", "", { labelEn: "Language", keywordsEn: "currency" }),
];

describe("searchSettings", () => {
  it("is case and accent insensitive", () => {
    expect(searchSettings([item("a", "Café hours")], "CAFE")[0]?.item.id).toBe("a");
  });
  it("matches word starts and prefixes", () => {
    expect(searchSettings(items, "spee")[0]?.item.id).toBe("speed");
    expect(searchSettings(items, "reg")[0]?.item.id).toBe("region");
  });
  it("finds synonyms", () => {
    expect(searchSettings(items, "rupee")[0]?.item.id).toBe("region");
    expect(searchSettings(items, "quiet")[0]?.item.id).toBe("mute");
    expect(searchSettings(items, "password")[0]?.item.id).toBe("security");
    expect(searchSettings(items, "delete account")[0]?.item.id).toBe("delete");
  });
  it("tolerates one typo in words of four letters or more, not in short ones", () => {
    expect(searchSettings(items, "notifcations")[0]?.item.id).toBe("mute");
    expect(searchSettings(items, "spead")[0]?.item.id).toBe("speed");
    expect(searchSettings(items, "mte")).toHaveLength(0);
  });
  it("ranks label above keyword above description", () => {
    const list = [item("d", "Other", "", { description: "export data" }), item("k", "Other two", "export"), item("l", "Export")];
    expect(searchSettings(list, "export").map((h) => h.item.id)).toEqual(["l", "k", "d"]);
  });
  it("requires every typed word", () => {
    expect(searchSettings(items, "speed rupee")).toHaveLength(0);
  });
  it("falls back to English words in another language, and keeps native text matching", () => {
    expect(searchSettings(items, "currency").map((h) => h.item.id)).toContain("hi");
    expect(searchSettings(items, "भाषा")[0]?.item.id).toBe("hi");
  });
  it("returns nothing for an empty query", () => {
    expect(searchSettings(items, "  ")).toEqual([]);
  });
});

describe("withinOneEdit", () => {
  it("handles substitution, insertion, deletion and swap", () => {
    expect(withinOneEdit("speed", "spead")).toBe(true);
    expect(withinOneEdit("speed", "sped")).toBe(true);
    expect(withinOneEdit("speed", "speeed")).toBe(true);
    expect(withinOneEdit("speed", "psеed")).toBe(false);
    expect(withinOneEdit("abcd", "abdc")).toBe(true);
    expect(withinOneEdit("abcd", "abxy")).toBe(false);
  });
});

describe("highlight", () => {
  it("marks the typed words at word starts", () => {
    expect(highlight("Speaking speed", "spee")).toEqual([{ text: "Speaking ", hit: false }, { text: "spee", hit: true }, { text: "d", hit: false }]);
  });
});
