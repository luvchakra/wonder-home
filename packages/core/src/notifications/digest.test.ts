import { describe, expect, it } from "vitest";

import { formatterFor } from "../i18n/format";
import { en } from "../i18n/messages/en";
import { DEFAULT_PREFERENCES } from "../i18n/preferences";
import { translator } from "../i18n/translate";
import { CHANNEL_ADAPTERS, type ChannelAdapter, type DeliveryChannel } from "./channels";
import { deliverNotification } from "./deliver";
import { digestDue, digestText, sendDueDigests } from "./digest";
import { memoryDatabase } from "./test-support";

const t = translator("en", en);
const format = formatterFor(DEFAULT_PREFERENCES);
const row = (title: string) => ({ title, body: "", scheduled_for: "2026-10-20T04:00:00Z" });

describe("what the digest says (story 27-008)", () => {
  it("is nothing on an empty day", () => {
    expect(digestText([], t, format)).toBeNull();
  });
  it("lists the day in one sentence, one thing or many", () => {
    expect(digestText([row("Electricity bill")], t, format)).toEqual({ title: "Your day at home", body: "1 thing today: Electricity bill." });
    expect(digestText([row("Electricity bill"), row("Piano")], t, format)).toEqual({ title: "Your day at home", body: "2 things today: Electricity bill and Piano." });
  });
  it("shows six and counts the rest", () => {
    const body = digestText(Array.from({ length: 9 }, (_, index) => row(`Item ${index + 1}`)), t, format)!.body;
    expect(body).toContain("9 things today: Item 1, Item 2, Item 3, Item 4, Item 5, Item 6");
    expect(body).toContain("3 more");
    expect(body).not.toContain("Item 7");
  });
});

describe("when a digest is due", () => {
  const input = (now: string, over: Partial<{ minute: number; lastOn: string | null }> = {}) => digestDue({ now: new Date(now), timeZone: "Asia/Kolkata", minute: 450, lastOn: null, ...over });
  it("comes at the person's time on the household's clock, not the server's", () => {
    expect(input("2026-10-20T01:59:00Z").due).toBe(false); // 07:29 in Kolkata
    expect(input("2026-10-20T02:00:00Z").due).toBe(true); // 07:30
    expect(input("2026-10-20T02:00:00Z").today).toBe("2026-10-20");
  });
  it("is skipped once it is hours late, and never twice in a day", () => {
    expect(input("2026-10-20T04:59:00Z").due).toBe(true); // 10:29
    expect(input("2026-10-20T05:00:00Z").due).toBe(false); // 10:30
    expect(input("2026-10-20T02:10:00Z", { lastOn: "2026-10-20" }).due).toBe(false);
    expect(input("2026-10-20T02:10:00Z", { lastOn: "2026-10-19" }).due).toBe(true);
  });
});

const NOW = new Date("2026-10-20T02:15:00Z"); // 07:45 in Kolkata
const sentMessages: string[] = [];
const emailAdapter: ChannelAdapter = { channel: "email", live: true, async send(notification, to) { sentMessages.push(`${to}|${notification.title}|${notification.body}`); return { ok: true }; } };
const adapters = { ...CHANNEL_ADAPTERS, email: emailAdapter } as Record<DeliveryChannel, ChannelAdapter>;

function database(over: Record<string, Record<string, unknown>[]> = {}) {
  const db = memoryDatabase({
    households: [{ id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" }],
    household_members: [{ id: "m1", profile_id: "u1", language: null, date_format: null, time_format: null, measurement_system: null }],
    notification_preferences: [{ household_id: "h1", member_id: "m1", channel: "email", enabled: true, digest: true, digest_minute: 450, digest_last_on: null, quiet_from: null, quiet_until: null, target: null }],
    notification_channel_mutes: [],
    push_subscriptions: [],
    notification_events: [],
    notifications: [
      { id: "n1", recipient_member_id: "m1", status: "delivered", title: "Electricity bill", body: "Due today", message: null, scheduled_for: "2026-10-20T03:30:00Z" },
      { id: "n2", recipient_member_id: "m1", status: "generated", title: "Piano", body: "At 6", message: null, scheduled_for: "2026-10-20T12:00:00Z" },
      { id: "n3", recipient_member_id: "m1", status: "generated", title: "Tomorrow's thing", body: "", message: null, scheduled_for: "2026-10-21T04:00:00Z" },
    ],
    ...over,
  });
  (db.client as unknown as { auth: unknown }).auth = { admin: { getUserById: async () => ({ data: { user: { email: "kunal@example.com", email_confirmed_at: "2026-01-01" } } }) } };
  return db;
}

describe("sending the digest", () => {
  it("sends today's reminders once, as a resolved notification, to the address of the account", async () => {
    sentMessages.length = 0;
    const { client, tables } = database();
    expect(await sendDueDigests(client, NOW, { adapters })).toBe(1);
    expect(sentMessages).toEqual(["kunal@example.com|Your day at home|2 things today: Electricity bill and Piano."]);
    const digest = tables.notifications!.find((entry) => entry.source_type === "digest")!;
    expect(digest).toMatchObject({ status: "resolved", thread_key: "digest:email:2026-10-20", recipient_member_id: "m1", source_id: "m1" });
    expect(tables.notification_preferences![0]!.digest_last_on).toBe("2026-10-20");
    expect(tables.notification_events).toEqual([expect.objectContaining({ channel: "email", event_type: "sent" })]);
  });

  it("does not send a second one that day", async () => {
    sentMessages.length = 0;
    const { client } = database();
    await sendDueDigests(client, NOW, { adapters });
    expect(await sendDueDigests(client, new Date(NOW.getTime() + 5 * 60_000), { adapters })).toBe(0);
    expect(sentMessages).toHaveLength(1);
  });

  it("sends nothing on an empty day, and still counts the day as done", async () => {
    sentMessages.length = 0;
    const { client, tables } = database({ notifications: [] });
    expect(await sendDueDigests(client, NOW, { adapters })).toBe(0);
    expect(sentMessages).toEqual([]);
    expect(tables.notification_preferences![0]!.digest_last_on).toBe("2026-10-20");
  });

  it("waits for the time, skips one that is hours late, and leaves a channel that is switched off alone", async () => {
    sentMessages.length = 0;
    const { client } = database();
    expect(await sendDueDigests(client, new Date("2026-10-20T01:00:00Z"), { adapters })).toBe(0);
    expect(await sendDueDigests(client, new Date("2026-10-20T07:00:00Z"), { adapters })).toBe(0);
    const off = database({ notification_preferences: [{ household_id: "h1", member_id: "m1", channel: "email", enabled: false, digest: true, digest_minute: 450, digest_last_on: null }] });
    expect(await sendDueDigests(off.client, NOW, { adapters })).toBe(0);
    expect(sentMessages).toEqual([]);
  });
});

describe("the reminders a digest holds do not also buzz", () => {
  const input = (priority: "low" | "normal" | "high" | "critical", over: Record<string, unknown> = {}) => ({ householdId: "h1", notificationId: "n1", recipientMemberId: "m1", notification: { title: "Piano", body: "At 6", priority }, reason: "reminder" as const, ...over });

  it("holds an ordinary reminder on a channel that carries a digest, and lets urgent and critical ones through", async () => {
    sentMessages.length = 0;
    for (const priority of ["normal", "low"] as const) expect(await deliverNotification(database().client, input(priority), adapters)).toEqual({ sent: [], failed: [] });
    expect(await deliverNotification(database().client, input("high"), adapters)).toEqual({ sent: ["email"], failed: [] });
    expect(await deliverNotification(database().client, input("critical"), adapters)).toEqual({ sent: ["email"], failed: [] });
  });

  it("does not hold an alert about something that happened, nor a channel with no digest", async () => {
    expect(await deliverNotification(database().client, input("normal", { reason: "alert" }), adapters)).toEqual({ sent: [], failed: [] }); // an ordinary alert never reaches email anyway
    const plain = database({ notification_preferences: [{ household_id: "h1", member_id: "m1", channel: "email", enabled: true, digest: false, quiet_from: null, quiet_until: null, target: null }] });
    expect(await deliverNotification(plain.client, input("normal"), adapters)).toEqual({ sent: ["email"], failed: [] });
  });
});
