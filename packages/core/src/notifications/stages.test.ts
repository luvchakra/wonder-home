import { describe, expect, it } from "vitest";

import { CHANNEL_ADAPTERS } from "./channels";
import { advanceDueStages, deliverDueNotifications, STAGE_HOUSEHOLDS_PER_TICK, type ReconcileResult } from "./reconcile";
import { memoryDatabase } from "./test-support";
import { NEXT_CHECK_CAP_MINUTES, nextReminderCheck, type DesiredReminder } from "./plan";
import { formatterFor } from "../i18n/format";
import { DEFAULT_PREFERENCES } from "../i18n/preferences";
import { familySubject, sameOccasionAsEvent, schoolSubject, type FamilyEventRow, type SchoolItemRow } from "./sources";

const IST = "Asia/Kolkata";

describe("one reminder per occasion (the owner's review, 2026-10-22)", () => {
  const trip: FamilyEventRow = { id: "bounce", title: "Bounce School Trip", kind: "school_event", starts_at: "2026-10-22T02:30:00Z", status: "planned", owner_member_id: "kunal" };
  const notice: SchoolItemRow = { id: "s1", child_member_id: "asmi", kind: "event", title: "Field trip to Bounce", due_at: "2026-10-22T02:00:00Z", due_time_known: true, status: "pending" };

  it("drops the school entry's reminder when a family event that day is the same occasion by another name", () => {
    expect(sameOccasionAsEvent(notice, [trip], IST)).toBe(true);
  });

  it("matches an entry with no time by its own day", () => {
    expect(sameOccasionAsEvent({ ...notice, due_at: "2026-10-22T00:00:00Z", due_time_known: false }, [trip], IST)).toBe(true);
  });

  it("keeps it on another day, for another thing, or when the event was cancelled", () => {
    expect(sameOccasionAsEvent(notice, [{ ...trip, starts_at: "2026-10-29T02:30:00Z" }], IST)).toBe(false);
    expect(sameOccasionAsEvent({ ...notice, title: "Maths worksheet" }, [trip], IST)).toBe(false);
    expect(sameOccasionAsEvent(notice, [{ ...trip, status: "cancelled" }], IST)).toBe(false);
    expect(sameOccasionAsEvent({ ...notice, due_at: null }, [trip], IST)).toBe(false);
    expect(sameOccasionAsEvent(notice, [], IST)).toBe(false);
  });
});

describe("the delivery clock moves reminders to their next stage", () => {
  const ran: ReconcileResult = { ran: true, created: 1, updated: 0, resolved: 0, expired: 0, delivered: 1 };
  const skipped: ReconcileResult = { ran: false, created: 0, updated: 0, resolved: 0, expired: 0, delivered: 0 };

  /** Just enough of the one read: the households whose next check has come. */
  function fakeAdmin(due: string[], fail = false) {
    const calls: { table: string; filters: string[] }[] = [];
    const admin = {
      from(table: string) {
        const call = { table, filters: [] as string[] };
        calls.push(call);
        const result = fail ? { data: null, error: { code: "x" } } : { data: due.map((household_id) => ({ household_id })), error: null };
        const chain: Record<string, unknown> = {
          select: () => chain,
          lte: (column: string, value: string) => (call.filters.push(`${column} <= ${value}`), chain),
          order: (column: string) => (call.filters.push(`order ${column}`), chain),
          limit: async (count: number) => (call.filters.push(`limit ${count}`), result),
        };
        return chain;
      },
    };
    return { admin: admin as never, calls };
  }

  it("takes the households that are due, earliest first, and counts those that ran", async () => {
    const now = new Date("2026-10-22T01:30:00Z");
    const { admin, calls } = fakeAdmin(["c", "b", "a"]);
    const order: string[] = [];
    const summary = await advanceDueStages(admin, now, {
      pass: async (householdId) => {
        order.push(householdId);
        return householdId === "a" ? skipped : ran;
      },
    });
    expect(order).toEqual(["c", "b", "a"]);
    expect(summary).toMatchObject({ households: 2, created: 2, delivered: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ table: "notification_reconciliations", filters: [`next_due_at <= ${now.toISOString()}`, "order next_due_at", `limit ${STAGE_HOUSEHOLDS_PER_TICK}`] });
  });

  it("does nothing when nobody is due, or the read fails", async () => {
    let passes = 0;
    const pass = async () => (passes++, ran);
    expect((await advanceDueStages(fakeAdmin([]).admin, new Date(), { pass })).households).toBe(0);
    expect((await advanceDueStages(fakeAdmin(["a"], true).admin, new Date(), { pass })).households).toBe(0);
    expect(passes).toBe(0);
  });
});

describe("when the clock next looks at a household (the owner's review, 2026-10-22)", () => {
  const now = new Date("2026-10-22T03:00:00Z");
  const at = (iso: string) => new Date(iso);
  const want = (overrides: Partial<DesiredReminder> = {}): DesiredReminder =>
    ({
      recipientMemberId: "kunal",
      recipientRole: "primary",
      threadKey: "obligation:b1",
      category: "bills",
      reminderSeq: 1,
      finalStage: false,
      scheduledFor: at("2026-10-22T02:00:00Z"),
      latestAt: at("2026-10-23T03:30:00Z"),
      expiresAt: at("2026-10-25T18:30:00Z"),
      ...overrides,
    }) as DesiredReminder;
  const open = (row: Partial<{ reminder_seq: number; status: string; delivered_at: string | null; snooze_count: number; expires_at: string | null }> = {}) =>
    new Map([["kunal|obligation:b1", { reminder_seq: 1, status: "delivered", delivered_at: "2026-10-22T02:00:00Z", snooze_count: 0, expires_at: null, ...row }]]);

  it("is the next stage when nothing comes sooner", () => {
    expect(nextReminderCheck([want({ latestAt: at("2026-10-22T05:00:00Z") })], open(), now)).toEqual(at("2026-10-22T05:00:00Z"));
  });

  it("is a reminder still to land", () => {
    expect(nextReminderCheck([want({ scheduledFor: at("2026-10-22T03:20:00Z") })], new Map(), now)).toEqual(at("2026-10-22T03:20:00Z"));
  });

  it("is an open reminder's expiry", () => {
    expect(nextReminderCheck([], open({ expires_at: "2026-10-22T04:00:00Z" }), now)).toEqual(at("2026-10-22T04:00:00Z"));
  });

  it("is the channel step's wait after the last reminder went out, then the backup's", () => {
    // Bills: the channel step after 90 minutes, the backup after 180.
    expect(nextReminderCheck([want({ finalStage: true })], open(), now)).toEqual(at("2026-10-22T03:30:00Z"));
    expect(nextReminderCheck([want({ finalStage: true })], open({ snooze_count: 1 }), now)).toEqual(at("2026-10-22T05:00:00Z"));
  });

  it("counts the wait from now for a last reminder going out in this pass", () => {
    expect(nextReminderCheck([want({ finalStage: true })], open({ status: "generated", delivered_at: null }), now)).toEqual(at("2026-10-22T04:30:00Z"));
  });

  it("is never more than the cap away, and never in the past", () => {
    const capped = new Date(now.getTime() + NEXT_CHECK_CAP_MINUTES * 60_000);
    expect(nextReminderCheck([], new Map(), now)).toEqual(capped);
    expect(nextReminderCheck([want({ scheduledFor: at("2026-10-21T00:00:00Z"), latestAt: at("2026-10-29T00:00:00Z"), expiresAt: at("2026-10-30T00:00:00Z") })], new Map(), now)).toEqual(capped);
  });
});

describe("an event earns its push on the day (the owner's review, 2026-10-22)", () => {
  const context = { timeZone: IST, format: formatterFor(DEFAULT_PREFERENCES), now: new Date("2026-10-21T10:00:00Z") };
  const school: SchoolItemRow = { id: "s1", child_member_id: "asmi", kind: "event", title: "Field trip to Bounce", due_at: "2026-10-22T02:00:00Z", due_time_known: true, status: "pending" };
  const event: FamilyEventRow = { id: "e1", title: "Bounce School Trip", kind: "outing", starts_at: "2026-10-22T02:30:00Z", status: "planned", owner_member_id: "kunal" };

  it("is a quiet heads-up the night before and normal on the morning, so it may buzz", () => {
    const subject = schoolSubject(school, "Asmi", context)!;
    expect(subject.text("tonight", context.now).priority).toBe("low");
    expect(subject.text("this_morning", context.now).priority).toBe("medium");
  });

  it("does the same for a family event", () => {
    const subject = familySubject(event, context)!;
    expect(subject.text("tomorrow", context.now).priority).toBe("low");
    expect(subject.text("starts_soon", context.now).priority).toBe("medium");
    expect(subject.text("today", context.now).priority).toBe("medium");
  });

  it("leaves other school work as it was", () => {
    const homework = schoolSubject({ ...school, kind: "homework", title: "Maths worksheet" }, "Asmi", context)!;
    expect(homework.text("tonight", context.now).priority).toBe("medium");
  });
});

describe("a reminder held back by quiet hours goes out the same way when it lands", () => {
  const now = new Date("2026-10-22T03:00:00Z");
  function setup(sourceType: string) {
    const sent: string[] = [];
    const { client } = memoryDatabase({
      households: [{ id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" }],
      household_members: [{ id: "m1", profile_id: "u1", language: null, date_format: null, time_format: null, measurement_system: null, member_type: "adult" }],
      notification_preferences: [{ member_id: "m1", channel: "email", enabled: true, quiet_from: null, quiet_until: null, target: null }],
      notifications: [{ id: "n1", household_id: "h1", recipient_member_id: "m1", title: "Dentist", body: "Today's the day", message: null, priority: "normal", status: "generated", scheduled_for: "2026-10-22T02:30:00Z", source_type: sourceType, category: "appointments" }],
    } as Record<string, Record<string, unknown>[]>);
    (client as unknown as { auth: unknown }).auth = { admin: { getUserById: async () => ({ data: { user: { email: "a@b.co", email_confirmed_at: "2026-01-01" } } }) } };
    const adapters = { ...CHANNEL_ADAPTERS, email: { channel: "email" as const, live: true, async send(notification: { title: string }) { sent.push(notification.title); return { ok: true as const }; } } };
    return { sent, run: () => deliverDueNotifications(client, "h1", now, adapters) };
  }

  it("emails a health appointment reminder that waited for quiet hours to end", async () => {
    const { sent, run } = setup("health_appointment");
    expect(await run()).toBe(1);
    expect(sent).toEqual(["Dentist"]);
  });

  it("keeps a notice that only lands in the app there", async () => {
    const { sent, run } = setup("helper_absence");
    expect(await run()).toBe(1);
    expect(sent).toEqual([]);
  });
});
