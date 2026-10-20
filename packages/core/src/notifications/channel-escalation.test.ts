import { describe, expect, it } from "vitest";

import { CHANNEL_ADAPTERS, type ChannelAdapter, type DeliveryChannel } from "./channels";
import { escalateAcrossChannels } from "./channel-escalation";
import type { DesiredReminder } from "./plan";
import { isUnansweredForChannel } from "./plan";
import { maxDeliveriesFor, maxRemindersFor, REMINDER_POLICIES, TUNABLE_CATEGORIES } from "./policies";
import { memoryDatabase } from "./test-support";

const NOW = new Date("2026-10-20T06:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const want = (over: Partial<DesiredReminder> = {}) => ({ category: "bills", finalStage: true, reminderSeq: 2, ...over }) as DesiredReminder;
const open = (over: Record<string, unknown> = {}) => ({ reminder_seq: 2, status: "delivered", delivered_at: minutesAgo(100), snooze_count: 0, ...over });

describe("the channel step comes only for an unanswered last reminder (27-007)", () => {
  it("waits for the policy's own minutes, then is due", () => {
    expect(isUnansweredForChannel(want(), open({ delivered_at: minutesAgo(89) }), NOW)).toBe(false);
    expect(isUnansweredForChannel(want(), open({ delivered_at: minutesAgo(91) }), NOW)).toBe(true);
  });
  it("stops the moment the reminder is acted on, dismissed, snoozed or has moved on", () => {
    for (const status of ["acted", "dismissed", "resolved", "expired", "generated"]) expect(isUnansweredForChannel(want(), open({ status }), NOW)).toBe(false);
    expect(isUnansweredForChannel(want(), open({ snooze_count: 1 }), NOW)).toBe(false);
    expect(isUnansweredForChannel(want(), open({ reminder_seq: 1 }), NOW)).toBe(false);
    expect(isUnansweredForChannel(want(), undefined, NOW)).toBe(false);
  });
  it("is not for an earlier reminder in the sequence, nor for a kind that has no channel step", () => {
    expect(isUnansweredForChannel(want({ finalStage: false }), open(), NOW)).toBe(false);
    expect(isUnansweredForChannel(want({ category: "meals" }), open(), NOW)).toBe(false);
  });
  it("comes before the backup does, in every policy that has both", () => {
    for (const category of TUNABLE_CATEGORIES) {
      const policy = REMINDER_POLICIES[category];
      if (policy.channelEscalation && policy.escalation) expect(policy.channelEscalation.afterMinutes).toBeLessThan(policy.escalation.afterMinutes);
    }
  });
  it("is one extra delivery of the last reminder, within the same ceiling as before", () => {
    expect(maxRemindersFor("bills", null)).toBe(3);
    expect(maxDeliveriesFor("bills", null)).toBe(4);
    expect(maxDeliveriesFor("meals", null)).toBe(1);
    for (const category of TUNABLE_CATEGORIES) for (const preset of REMINDER_POLICIES[category].presets) expect(maxDeliveriesFor(category, preset.key)).toBeLessThanOrEqual(10);
  });
});

const adapter = (channel: DeliveryChannel, sent: string[]): ChannelAdapter => ({ channel, live: true, async send(notification, target) { sent.push(`${channel}:${notification.title}:${target}`); return { ok: true }; } });

function household(over: Record<string, unknown[]> = {}) {
  return memoryDatabase({
    households: [{ id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" }],
    household_members: [{ id: "m1", profile_id: "u1", language: null, date_format: null, time_format: null, measurement_system: null }],
    notification_preferences: [{ member_id: "m1", channel: "email", enabled: true, quiet_from: null, quiet_until: null, target: null }],
    notification_channel_mutes: [],
    push_subscriptions: [],
    notification_events: [],
    ...over,
  } as Record<string, Record<string, unknown>[]>);
}
const row = { id: "n1", recipient_member_id: "m1", title: "Electricity", body: "Due today", message: null, priority: "normal" };
const baseInput = (sent: string[]) => ({ householdId: "h1", row, category: "bills", via: ["email", "whatsapp"] as DeliveryChannel[], now: NOW, adapters: { ...CHANNEL_ADAPTERS, email: adapter("email", sent) } });

describe("escalateAcrossChannels", () => {
  it("sends the reminder by the first channel the person has on, and records that the step was taken", async () => {
    const sent: string[] = [];
    const { client, tables } = household();
    // The member's account email is read through auth in production; this fake has none, so give it one.
    (client as unknown as { auth: unknown }).auth = { admin: { getUserById: async () => ({ data: { user: { email: "a@b.co", email_confirmed_at: "2026-01-01" } } }) } };
    expect(await escalateAcrossChannels(client, baseInput(sent))).toBe("email");
    expect(sent).toEqual(["email:Electricity:a@b.co"]);
    expect(tables.notification_events!.filter((event) => event.event_type === "escalated")).toEqual([expect.objectContaining({ channel: "email", metadata: { to: "channel" } })]);
  });

  it("happens once: a second pass finds the step taken and sends nothing", async () => {
    const sent: string[] = [];
    const { client } = household();
    (client as unknown as { auth: unknown }).auth = { admin: { getUserById: async () => ({ data: { user: { email: "a@b.co", email_confirmed_at: "2026-01-01" } } }) } };
    await escalateAcrossChannels(client, baseInput(sent));
    expect(await escalateAcrossChannels(client, baseInput(sent))).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("is still taken, with nothing sent, when the person has no channel on that can carry it", async () => {
    const sent: string[] = [];
    const { client, tables } = household({ notification_preferences: [] });
    expect(await escalateAcrossChannels(client, baseInput(sent))).toBeNull();
    expect(sent).toEqual([]);
    expect(tables.notification_events).toEqual([expect.objectContaining({ event_type: "escalated", channel: null, metadata: { to: "channel" } })]);
    expect(await escalateAcrossChannels(client, baseInput(sent))).toBeNull();
    expect(tables.notification_events).toHaveLength(1);
  });

  it("respects a kind the person keeps off that channel", async () => {
    const sent: string[] = [];
    const { client } = household({ notification_channel_mutes: [{ member_id: "m1", category: "bills", channel: "email" }] });
    (client as unknown as { auth: unknown }).auth = { admin: { getUserById: async () => ({ data: { user: { email: "a@b.co", email_confirmed_at: "2026-01-01" } } }) } };
    expect(await escalateAcrossChannels(client, baseInput(sent))).toBeNull();
    expect(sent).toEqual([]);
  });
});
