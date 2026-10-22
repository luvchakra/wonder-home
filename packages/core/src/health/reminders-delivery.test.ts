import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryDatabase } from "../notifications/test-support";

/**
 * Health reminders are timed reminders for one person (the owner's
 * notifications workbook, H01 and H02, 2026-10-22): "Today's the day" is as
 * much a reminder as a bill's due day, so it is delivered as one and may earn
 * a push or an email by the same gates. Sent without that word it counted as
 * an ordinary alert, and a Normal alert never leaves the app.
 */

const created: Record<string, unknown>[] = [];
vi.mock("../notifications/create", () => ({
  createNotification: vi.fn(async (_admin: unknown, input: Record<string, unknown>) => {
    created.push(input);
    return { id: `n${created.length}` };
  }),
}));

const { runHealthReminderSweep } = await import("./reminders");
const { runMeasurementRoutineSweep } = await import("./routine-reminders");

const HOUSEHOLD = "h1";
const people = {
  household_members: [{ id: "kunal", member_type: "adult", profile_id: "p-kunal", household_id: HOUSEHOLD }],
  member_guardians: [],
  notification_preferences: [],
  households: [{ id: HOUSEHOLD, timezone: "Asia/Kolkata" }],
  notifications: [],
};

describe("health reminders reach a person as timed reminders", () => {
  beforeEach(() => {
    created.length = 0;
  });

  it("H01: an appointment's day-of reminder is delivered as a reminder", async () => {
    const now = new Date("2026-10-25T02:00:00Z"); // 07:30 in Kolkata
    const { client } = memoryDatabase({
      ...people,
      health_appointments: [
        { id: "a1", household_id: HOUSEHOLD, member_id: "kunal", appointment_type: "checkup", status: "confirmed", starts_at: "2026-10-25T05:30:00Z", remind_advance: true, remind_preparation: false, remind_day_of: true, preparation_notes: null },
      ],
    });
    const summary = await runHealthReminderSweep(client, now);
    expect(summary.sent).toBe(1);
    expect(created[0]).toMatchObject({ category: "appointments", reason: "reminder", source: { type: "health_appointment", id: "a1" } });
  });

  it("H02: a measurement due today is delivered as a reminder", async () => {
    const now = new Date("2026-10-22T04:00:00Z"); // 09:30 in Kolkata
    const { client } = memoryDatabase({
      ...people,
      health_measurement_routines: [
        { id: "r1", household_id: HOUSEHOLD, member_id: "kunal", vital_type: "blood_pressure", custom_label: null, next_due_on: "2026-10-22", reminder_enabled: true, status: "active" },
      ],
    });
    const summary = await runMeasurementRoutineSweep(client, now);
    expect(summary.sent).toBe(1);
    expect(created[0]).toMatchObject({ category: "appointments", reason: "reminder", source: { type: "health_routine", id: "r1" } });
  });
});
