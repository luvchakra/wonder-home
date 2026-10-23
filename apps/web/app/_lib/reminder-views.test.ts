import { describe, expect, it } from "vitest";

import type { Formatter } from "@wonderhome/core/i18n/format";
import type { Translate } from "@wonderhome/core/i18n/translate";

import { toReminderView, type ReminderRowData } from "./reminder-views";

/**
 * Every card on the redesigned notification center (2026-10-23) carries a
 * way to act: its own place for a notice, else the screen its record lives
 * on. A notice's place comes from its stored action and only ever stays
 * inside WonderHome.
 */

const t = ((key: string) => key) as unknown as Translate;
const format = { time: () => "10:00", date: () => "23 Oct" } as unknown as Formatter;
const now = new Date("2026-10-23T08:00:00Z");

function row(partial: Partial<ReminderRowData>): ReminderRowData {
  return {
    id: "n1",
    type: "notice",
    status: "delivered",
    category: "family",
    priority: "normal",
    title: "Title",
    body: "Body",
    source_type: null,
    source_id: null,
    scheduled_for: "2026-10-23T07:00:00Z",
    latest_at: null,
    expires_at: null,
    decision_factors: null,
    updated_at: "2026-10-23T07:00:00Z",
    ...partial,
  };
}

const view = (partial: Partial<ReminderRowData>) => toReminderView(row(partial), new Map(), format, now, "Asia/Kolkata", t);

describe("where a notification card leads", () => {
  it("opens a chat notice in its own thread", () => {
    expect(view({ source_type: "chat_thread", source_id: "c1", action: { action: "open", target: "/chat/c1" } }).link).toEqual({ href: "/chat/c1", label: "notifications.link.chat" });
  });

  it("never follows a stored target that leaves the app", () => {
    for (const target of ["//evil.example/x", "https://evil.example", "javascript:alert(1)"]) {
      expect(view({ source_type: "chat_thread", source_id: "c1", action: { action: "open", target } }).link).toBeNull();
    }
  });

  it("opens a notice with no action of its own on the screen its record lives on", () => {
    expect(view({ source_type: "homesend_item", source_id: "h1" }).link?.href).toBe("/home-send");
    expect(view({ source_type: "event_change", source_id: "e1" }).link?.href).toBe("/calendar");
    expect(view({ source_type: "helper_absence", source_id: "a1" }).link?.href).toBe("/househelper");
  });
});
