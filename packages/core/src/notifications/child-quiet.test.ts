import { describe, expect, it } from "vitest";

import { CHANNEL_ADAPTERS, type ChannelAdapter, type DeliveryChannel } from "./channels";
import { childQuietHours, quietColumns } from "./child-quiet";
import { deliverNotification } from "./deliver";
import { memoryDatabase } from "./test-support";

const ON = new Date("2026-10-20T00:00:00Z");

describe("a child's quiet hours by age (story 27-015)", () => {
  it("follows the age band, and widens on the birthday", () => {
    expect(childQuietHours({ memberType: "child", dateOfBirth: "2021-03-01" }, ON)).toEqual({ fromMinute: 19 * 60 + 30, untilMinute: 7 * 60 });
    expect(childQuietHours({ memberType: "child", dateOfBirth: "2016-03-01" }, ON)).toEqual({ fromMinute: 20 * 60 + 30, untilMinute: 7 * 60 });
    expect(childQuietHours({ memberType: "child", dateOfBirth: "2011-03-01" }, ON)).toEqual({ fromMinute: 22 * 60, untilMinute: 7 * 60 });
    // Turns eight the day after: the older band starts then.
    expect(childQuietHours({ memberType: "child", dateOfBirth: "2018-10-21" }, ON)!.fromMinute).toBe(19 * 60 + 30);
    expect(childQuietHours({ memberType: "child", dateOfBirth: "2018-10-21" }, new Date("2026-10-21T00:00:00Z"))!.fromMinute).toBe(20 * 60 + 30);
  });
  it("has no default for an adult or a helper, and the middle band for a child with no date of birth", () => {
    expect(childQuietHours({ memberType: "adult", dateOfBirth: "1985-01-01" }, ON)).toBeNull();
    expect(childQuietHours({ memberType: "helper", dateOfBirth: null }, ON)).toBeNull();
    expect(childQuietHours({ memberType: "child", dateOfBirth: null }, ON)!.fromMinute).toBe(20 * 60 + 30);
    expect(childQuietHours({ memberType: "child", dateOfBirth: "2026-13-45" }, ON)!.fromMinute).toBe(20 * 60 + 30);
  });
  it("is written as whole hours and minutes past the hour, as preferences keep it", () => {
    expect(quietColumns({ fromMinute: 19 * 60 + 30, untilMinute: 7 * 60 })).toEqual({ quietFrom: 19, quietFromMinute: 30, quietUntil: 7, quietUntilMinute: 0 });
  });
});

const sent: string[] = [];
const adapters = { ...CHANNEL_ADAPTERS, email: { channel: "email", live: true, async send(n, to) { sent.push(`${to}|${n.title}`); return { ok: true }; } } as ChannelAdapter } as Record<DeliveryChannel, ChannelAdapter>;

function delivery(over: { dob?: string | null; type?: string; quiet?: { quiet_from: number; quiet_until: number } | null } = {}) {
  const db = memoryDatabase({
    households: [{ id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" }],
    household_members: [{ id: "m1", profile_id: "u1", member_type: over.type ?? "child", date_of_birth: over.dob === undefined ? "2021-03-01" : over.dob }],
    notification_preferences: [{ member_id: "m1", channel: "email", enabled: true, quiet_from: over.quiet?.quiet_from ?? null, quiet_until: over.quiet?.quiet_until ?? null, target: null }],
    notification_channel_mutes: [],
    push_subscriptions: [],
    notification_events: [],
  });
  (db.client as unknown as { auth: unknown }).auth = { admin: { getUserById: async () => ({ data: { user: { email: "asmi@example.com", email_confirmed_at: "2026-01-01" } } }) } };
  return db;
}
const input = (hourUtc: number) => ({ householdId: "h1", notificationId: "n1", recipientMemberId: "m1", notification: { title: "Homework", body: "Due", priority: "high" as const }, reason: "reminder" as const, now: new Date(`2026-10-20T${String(hourUtc).padStart(2, "0")}:00:00Z`) });

describe("a child's channels keep their age's quiet hours", () => {
  it("holds a reminder at 9 PM for a six-year-old, and sends it at noon", async () => {
    sent.length = 0;
    expect(await deliverNotification(delivery().client, input(15), adapters)).toEqual({ sent: [], failed: [] }); // 20:30 in Kolkata
    expect(await deliverNotification(delivery().client, input(6), adapters)).toEqual({ sent: ["email"], failed: [] }); // 11:30
  });
  it("lets a window the guardian set win over the age's, and never touches an adult", async () => {
    expect(await deliverNotification(delivery({ quiet: { quiet_from: 23, quiet_until: 6 } }).client, input(15), adapters)).toEqual({ sent: ["email"], failed: [] }); // 20:30, before their 23:00
    expect(await deliverNotification(delivery({ type: "adult", dob: "1985-01-01" }).client, input(15), adapters)).toEqual({ sent: ["email"], failed: [] });
  });
  it("still lets something critical through", async () => {
    expect(await deliverNotification(delivery().client, { ...input(15), notification: { title: "Gas leak", body: "Now", priority: "critical" } }, adapters)).toEqual({ sent: ["email"], failed: [] });
  });
});
