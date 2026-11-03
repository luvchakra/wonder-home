import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Formatter } from "@wonderhome/core/i18n/format";
import type { Translate } from "@wonderhome/core/i18n/translate";

import { groupReminders, isUrgent, rowViewOf, sectionedGroups, type GroupWords } from "./reminder-groups";
import { loadReminderDetails, toReminderView, type ReminderRowData } from "./reminder-views";

/**
 * The crisp notification center (the owner, 2026-11-03): alike reminders say
 * themselves once, every row has one thing to do, and rows sit in sections by
 * what the reader decides.
 */

const t = ((key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key)) as unknown as Translate;
const format = { time: () => "10:00", date: (value: string) => `on ${value}`, money: (amount: number) => `₹${amount}` } as unknown as Formatter;
const now = new Date("2026-11-03T08:00:00Z");
const words: GroupWords = { homesendTitle: (count) => `${count} waiting`, homesendLine: "Open HomeSend", alike: (count) => `${count} like this` };

let next = 0;
function row(partial: Partial<ReminderRowData>): ReminderRowData {
  next += 1;
  return {
    id: `n${next}`,
    type: "notice",
    status: "delivered",
    category: "family",
    priority: "normal",
    title: "Title",
    body: "Body",
    source_type: null,
    source_id: null,
    scheduled_for: "2026-11-03T07:00:00Z",
    latest_at: null,
    expires_at: null,
    decision_factors: null,
    updated_at: "2026-11-03T07:00:00Z",
    ...partial,
  };
}

const view = (partial: Partial<ReminderRowData>, details = new Map()) => toReminderView(row(partial), details, format, now, "Asia/Kolkata", t);
const homesend = (title: string) => view({ category: "system", source_type: "homesend_item", source_id: `item-${title}`, title });

describe("alike reminders are one row", () => {
  it("collapses n HomeSend items into one row with a count and one action", () => {
    const views = [homesend("A school notice is waiting for your OK"), homesend("A school notice is waiting for your OK"), homesend("A school notice is waiting for your OK"), homesend("Something sent to HomeSend is waiting for your OK")];
    const groups = groupReminders(views);
    expect(groups).toHaveLength(1);
    const shown = rowViewOf(groups[0]!, words);
    expect(shown.title).toBe("4 waiting");
    expect(shown.ids).toEqual(views.map((entry) => entry.id));
    expect(shown.primary).toEqual({ kind: "link", href: "/home-send", label: "notifications.link.homeSend" });
    expect(shown.more.items).toHaveLength(4);
  });

  it("collapses the same kind about the same place, and keeps different ones apart", () => {
    const groups = groupReminders([
      view({ source_type: "event_change", source_id: "e1", title: "Moved" }),
      view({ source_type: "event_change", source_id: "e2", title: "Moved" }),
      view({ source_type: "event_change", source_id: "e3", title: "Cancelled" }),
    ]);
    expect(groups.map((group) => group.count)).toEqual([2, 1]);
    expect(rowViewOf(groups[0]!, words).countLabel).toBe("2 like this");
    expect(rowViewOf(groups[1]!, words).countLabel).toBeNull();
  });
});

describe("one thing to do on every row", () => {
  const bill = new Map([["obligation:b1", { details: [{ label: "Paid to", value: "BESCOM" }], link: { href: "/bills", label: "View bill" }, complete: { label: "Mark as paid" }, fact: "₹300 · due yesterday", overdue: true }]]);

  it("a bill's row marks it paid; View bill waits behind the tap", () => {
    const shown = rowViewOf(groupReminders([view({ category: "bills", source_type: "obligation", source_id: "b1", title: "Electricity" }, bill)])[0]!, words);
    expect(shown.primary).toEqual({ kind: "complete", id: expect.any(String), label: "Mark as paid" });
    expect(shown.more.link).toEqual({ href: "/bills", label: "View bill" });
    expect(shown.line).toBe("₹300 · due yesterday");
  });

  it("several alike rows open their screen instead of marking one of them", () => {
    const twice = [view({ category: "bills", source_type: "obligation", source_id: "b1", title: "Electricity" }, bill), view({ category: "bills", source_type: "obligation", source_id: "b1", title: "Electricity" }, bill)];
    const shown = rowViewOf(groupReminders(twice)[0]!, words);
    expect(shown.primary).toEqual({ kind: "link", href: "/bills", label: "View bill" });
    expect(shown.more.link).toBeNull();
  });
});

describe("sections by what the reader decides", () => {
  it("orders overdue, then waiting for your OK, then today", () => {
    const sections = sectionedGroups([
      view({ title: "Pack the bag" }),
      homesend("A bill is waiting for your OK"),
      view({ title: "Late", latest_at: "2026-11-02T10:00:00Z" }),
    ]);
    expect(sections.map((entry) => entry.section)).toEqual(["overdue", "approve", "today"]);
    expect(sections.map((entry) => entry.groups.length)).toEqual([1, 1, 1]);
  });

  it("says Urgent only for money or health that is high priority", () => {
    expect(isUrgent(view({ category: "bills", priority: "high" }))).toBe(true);
    expect(isUrgent(view({ category: "appointments", priority: "high" }))).toBe(true);
    expect(isUrgent(view({ category: "system", priority: "high" }))).toBe(false);
    expect(isUrgent(view({ category: "bills", priority: "normal" }))).toBe(false);
  });
});

describe("a bill's key fact is said once", () => {
  it("puts the amount and due day on the row and leaves them out of the details", async () => {
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          in: async () => ({ data: table === "obligations" ? [{ id: "b1", name: "Electricity", payee: "BESCOM", amount_minor: 30000, currency: "INR", due_on: "2026-11-02", recurrence: null }] : [] }),
        }),
      }),
    } as unknown as SupabaseClient;
    const details = await loadReminderDetails(supabase, [row({ source_type: "obligation", source_id: "b1" })], format, { isAdmin: true, now, timeZone: "Asia/Kolkata" }, t);
    const found = details.get("obligation:b1")!;
    expect(found.fact).toBe("₹300 · notifications.fact.dueYesterday");
    expect(found.overdue).toBe(true);
    expect(found.details.map((detail) => detail.label)).toEqual(["notifications.detail.paidTo"]);
  });
});
