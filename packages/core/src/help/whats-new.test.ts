import { describe, expect, it } from "vitest";

import { en } from "../i18n/messages/en";
import { recentEntries, unseenEntries, WHATS_NEW, type WhatsNewEntry } from "./whats-new";

const entry = (id: string, at: string, audience?: "admin"): WhatsNewEntry => ({ id, at, icon: "calendar", href: "/", ...(audience ? { audience } : {}) });

describe("what's new", () => {
  const entries = [entry("new", "2026-10-18T01:00:00Z"), entry("older", "2026-10-10T00:00:00Z"), entry("old", "2026-08-01T00:00:00Z"), entry("admins", "2026-10-17T00:00:00Z", "admin")];
  const now = new Date("2026-10-18T06:00:00Z");

  it("shows only what is recent, and only what this reader may open", () => {
    expect(recentEntries(entries, now, { isAdmin: false }).map((e) => e.id)).toEqual(["new", "older"]);
    expect(recentEntries(entries, now, { isAdmin: true }).map((e) => e.id)).toEqual(["new", "older", "admins"]);
    // Nothing from the future, and everything drops off on its own after 30 days.
    expect(recentEntries(entries, new Date("2026-08-20T00:00:00Z"), { isAdmin: false }).map((e) => e.id)).toEqual(["old"]);
    expect(recentEntries(entries, new Date("2026-12-01T00:00:00Z"), { isAdmin: true })).toEqual([]);
  });

  it("lists what shipped after the last open, or everything recent on a first open", () => {
    expect(unseenEntries(entries, "2026-10-12T00:00:00Z").map((e) => e.id)).toEqual(["new", "admins"]);
    expect(unseenEntries(entries, null)).toHaveLength(4);
    expect(unseenEntries(entries, "not a date")).toHaveLength(4);
    expect(unseenEntries(entries, "2026-10-19T00:00:00Z")).toEqual([]);
  });

  it("is newest first, every entry has its words, and none is dated in the future of its own list", () => {
    const times = WHATS_NEW.map((e) => Date.parse(e.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const item of WHATS_NEW) {
      expect(en[`whatsNew.${item.id}.title` as keyof typeof en], item.id).toBeTruthy();
      expect(en[`whatsNew.${item.id}.body` as keyof typeof en], item.id).toBeTruthy();
      expect(item.href.startsWith("/")).toBe(true);
    }
    expect(new Set(WHATS_NEW.map((e) => e.id)).size).toBe(WHATS_NEW.length);
  });
});
