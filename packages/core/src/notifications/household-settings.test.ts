import { describe, expect, it } from "vitest";

import { CHANNEL_ADAPTERS, type ChannelAdapter, type DeliveryChannel } from "./channels";
import { deliverNotification } from "./deliver";
import {
  HOUSEHOLD_NOTIFICATION_DEFAULTS,
  HOUSEHOLD_NOTIFICATIONS_POLICY,
  householdAllowsChannel,
  parseHouseholdNotificationSettings,
  presetForMember,
  quietFromPolicy,
} from "./household-settings";
import { reconcileHouseholdReminders } from "./reconcile";
import { memoryDatabase } from "./test-support";

describe("what an Admin decides for the whole household (the owner, 2026-10-22)", () => {
  it("starts with everything on, as before anyone chose", () => {
    expect(parseHouseholdNotificationSettings(null)).toEqual(HOUSEHOLD_NOTIFICATION_DEFAULTS);
    expect(parseHouseholdNotificationSettings({})).toEqual(HOUSEHOLD_NOTIFICATION_DEFAULTS);
  });

  it("keeps only kinds, timings and channels that exist", () => {
    expect(
      parseHouseholdNotificationSettings({
        kindsOff: ["groceries", "weather", 3, "groceries"],
        defaults: { bills: "due_day", school: "next_year", meals: 4 },
        channelsOff: ["email", "in_app", "pigeon"],
        channelStep: false,
        backupStep: "no",
      }),
    ).toEqual({ kindsOff: ["groceries"], defaults: { bills: "due_day" }, channelsOff: ["email"], channelStep: false, backupStep: true });
  });

  it("gives a person their own timing first, then the household's, then the policy's", () => {
    const settings = parseHouseholdNotificationSettings({ defaults: { bills: "due_day" } });
    expect(presetForMember(settings, "bills", "week_and_due")).toBe("week_and_due");
    expect(presetForMember(settings, "bills", null)).toBe("due_day");
    expect(presetForMember(settings, "bills", "not_a_preset")).toBe("due_day");
    expect(presetForMember(settings, "school", null)).toBe("evening_and_morning");
  });

  it("holds a channel the household turned off, except for a critical alert", () => {
    const settings = parseHouseholdNotificationSettings({ channelsOff: ["email"] });
    expect(householdAllowsChannel(settings, "email", "high")).toBe(false);
    expect(householdAllowsChannel(settings, "email", "critical")).toBe(true);
    expect(householdAllowsChannel(settings, "push", "high")).toBe(true);
  });

  it("reads quiet hours by the hour, and 'off' as none", () => {
    expect(quietFromPolicy({ quietFromHour: 22, quietUntilHour: 7 })).toEqual({ fromMinute: 1320, untilMinute: 420 });
    expect(quietFromPolicy({ off: true })).toBeNull();
  });
});

const adapter = (channel: DeliveryChannel, sent: string[]): ChannelAdapter => ({ channel, live: true, async send(notification) { sent.push(`${channel}:${notification.title}`); return { ok: true }; } });

describe("delivery honours the channels the household turned off", () => {
  function setup(channelsOff: string[]) {
    const sent: string[] = [];
    const { client } = memoryDatabase({
      households: [{ id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" }],
      household_members: [{ id: "m1", profile_id: "u1", language: null, date_format: null, time_format: null, measurement_system: null, member_type: "adult" }],
      notification_preferences: [{ member_id: "m1", channel: "email", enabled: true, quiet_from: null, quiet_until: null, target: null }],
      policies: [{ household_id: "h1", category: "notifications", name: HOUSEHOLD_NOTIFICATIONS_POLICY, active: true, rule: { channelsOff } }],
    } as Record<string, Record<string, unknown>[]>);
    (client as unknown as { auth: unknown }).auth = { admin: { getUserById: async () => ({ data: { user: { email: "a@b.co", email_confirmed_at: "2026-01-01" } } }) } };
    const deliver = (priority: "high" | "critical") =>
      deliverNotification(
        client,
        { householdId: "h1", notificationId: "n1", recipientMemberId: "m1", notification: { title: "Electricity", body: "Due today", priority }, reason: "alert", now: new Date("2026-10-22T06:00:00Z") },
        { ...CHANNEL_ADAPTERS, email: adapter("email", sent) },
      );
    return { sent, deliver };
  }

  it("sends by email when the household allows it", async () => {
    const { sent, deliver } = setup([]);
    await deliver("high");
    expect(sent).toEqual(["email:Electricity"]);
  });

  it("keeps an ordinary alert off a channel the household turned off, but not a critical one", async () => {
    const { sent, deliver } = setup(["email"]);
    await deliver("high");
    expect(sent).toEqual([]);
    await deliver("critical");
    expect(sent).toEqual(["email:Electricity"]);
  });
});

describe("the reminder pass honours the household's kinds and timings", () => {
  // 22 Oct, 11:30 in Kolkata: a bill due on the 25th is three days out.
  const now = new Date("2026-10-22T06:00:00Z");
  function run(rule: Record<string, unknown> | null) {
    const { client, tables } = memoryDatabase({
      households: [{ id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en", status: "active" }],
      household_members: [{ id: "m1", household_id: "h1", profile_id: "u1", member_type: "adult", status: "active", display_name: "Kunal", nickname: null, date_of_birth: null }],
      household_roles: [{ household_id: "h1", member_id: "m1", role: "head" }],
      obligations: [{ id: "b1", household_id: "h1", name: "Electricity", payee: null, amount_minor: 120000, currency: "INR", due_on: "2026-10-25", status: "expected", responsible_member_id: "m1" }],
      policies: rule ? [{ household_id: "h1", category: "notifications", name: HOUSEHOLD_NOTIFICATIONS_POLICY, active: true, rule }] : [],
      notifications: [],
    } as Record<string, Record<string, unknown>[]>);
    return reconcileHouseholdReminders(client, "h1", { now, force: true, adapters: CHANNEL_ADAPTERS }).then(() => (tables.notifications ?? []).filter((row) => row.source_type === "obligation"));
  }

  it("reminds of a bill three days out by default", async () => {
    const rows = await run(null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient_member_id: "m1", reminder_policy: "bills.three_days_and_due" });
  });

  it("starts everyone on the household's timing", async () => {
    const rows = await run({ defaults: { bills: "due_day" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reminder_policy: "bills.due_day" });
  });

  it("reminds nobody of a kind the household turned off", async () => {
    expect(await run({ kindsOff: ["bills"] })).toEqual([]);
  });
});
