import { describe, expect, it } from "vitest";

import { classifyCheckup, completeCheckup, createCheckup, syncCheckupForAppointment } from "./checkups";

type Row = Record<string, unknown>;

const ACTOR = { householdId: "h-1", memberId: "m-1" };

const CHECKUP_ROW: Row = {
  id: "c-1",
  household_id: "h-1",
  member_id: "m-1",
  label: "Dental cleaning",
  checkup_type: "dentist",
  source: "user_defined",
  cadence_days: 180,
  next_due_on: "2026-10-01",
  last_completed_on: null,
  privacy_scope: "private",
  status: "active",
  linked_appointment_id: null,
  notes: null,
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

function fakeClient() {
  const checkupInserts: Row[] = [];
  const checkupUpdates: Row[] = [];
  let checkupRow: Row = { ...CHECKUP_ROW };

  const client = {
    from: (table: string) => {
      if (table !== "health_checkups") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            order: async () => ({ data: [checkupRow], error: null }),
            maybeSingle: async () => ({ data: checkupRow, error: null }),
          };
          return chain;
        },
        insert: (row: Row) => {
          checkupInserts.push(row);
          return { select: () => ({ single: async () => ({ data: { ...CHECKUP_ROW, ...row }, error: null }) }) };
        },
        update: (patch: Row) => {
          checkupUpdates.push(patch);
          checkupRow = { ...checkupRow, ...patch };
          const chain: Record<string, unknown> = {
            eq: () => chain,
            select: () => ({ single: async () => ({ data: checkupRow, error: null }) }),
          };
          return chain;
        },
      };
    },
  };

  return { client: client as never, checkupInserts, checkupUpdates };
}

describe("classifyCheckup", () => {
  const today = new Date("2026-09-22T00:00:00Z");

  it("is overdue when the due date has already passed", () => {
    expect(classifyCheckup({ status: "active", nextDueOn: "2026-09-01" }, today)).toBe("overdue");
  });

  it("is due soon within the window", () => {
    expect(classifyCheckup({ status: "active", nextDueOn: "2026-09-30" }, today)).toBe("due_soon");
  });

  it("is silent when far in the future", () => {
    expect(classifyCheckup({ status: "active", nextDueOn: "2027-01-01" }, today)).toBe("silent");
  });

  it("is silent when dismissed, regardless of the date", () => {
    expect(classifyCheckup({ status: "dismissed", nextDueOn: "2026-09-01" }, today)).toBe("silent");
  });
});

describe("createCheckup", () => {
  it("inserts with the caller's default source and links to the actor", async () => {
    const { client, checkupInserts } = fakeClient();
    await createCheckup(client, ACTOR, { memberId: "m-1", label: "Dental cleaning", checkupType: "dentist", nextDueOn: "2026-10-01", privacyScope: "private" });
    expect(checkupInserts[0]).toMatchObject({ source: "user_defined", created_by_member_id: "m-1" });
  });
});

describe("completeCheckup", () => {
  it("advances next_due_on by the cadence and clears the linked appointment", async () => {
    const { client, checkupUpdates } = fakeClient();
    const result = await completeCheckup(client, ACTOR, "c-1", "2026-10-01");
    expect(result.nextDueOn).toBe("2027-03-30");
    expect(result.lastCompletedOn).toBe("2026-10-01");
    expect(result.linkedAppointmentId).toBeNull();
    expect(checkupUpdates[0]).toMatchObject({ last_completed_on: "2026-10-01", linked_appointment_id: null, next_due_on: "2027-03-30" });
  });

  it("dismisses a one-off checkup with no cadence instead of computing a next date", async () => {
    const { client } = fakeClient();
    // Override the fake row to have no cadence.
    const noCadenceClient = {
      from: (table: string) => {
        if (table !== "health_checkups") throw new Error("unexpected");
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...CHECKUP_ROW, cadence_days: null }, error: null }) }) }),
          }),
          update: (patch: Row) => ({
            eq: () => ({
              eq: () => ({
                select: () => ({ single: async () => ({ data: { ...CHECKUP_ROW, cadence_days: null, ...patch }, error: null }) }),
              }),
            }),
          }),
        };
      },
    };
    const result = await completeCheckup(noCadenceClient as never, ACTOR, "c-1", "2026-10-01");
    expect(result.status).toBe("dismissed");
    void client;
  });
});

describe("syncCheckupForAppointment", () => {
  it("does nothing when the appointment has no linked checkup", async () => {
    const { client } = fakeClient();
    const result = await syncCheckupForAppointment(client, ACTOR, { id: "a-1", checkupId: null, status: "completed", startsAt: "2026-10-01T09:00:00Z" });
    expect(result).toBeNull();
  });

  it("completes the linked checkup using the appointment's own date when the appointment is completed", async () => {
    const { client, checkupUpdates } = fakeClient();
    const result = await syncCheckupForAppointment(client, ACTOR, { id: "a-1", checkupId: "c-1", status: "completed", startsAt: "2026-10-01T09:00:00Z" });
    expect(result?.lastCompletedOn).toBe("2026-10-01");
    expect(checkupUpdates[0]).toMatchObject({ last_completed_on: "2026-10-01" });
  });

  it("only unlinks (never completes) when the appointment is cancelled", async () => {
    const { client, checkupUpdates } = fakeClient();
    await syncCheckupForAppointment(client, ACTOR, { id: "a-1", checkupId: "c-1", status: "cancelled", startsAt: "2026-10-01T09:00:00Z" });
    expect(checkupUpdates[0]).toEqual({ linked_appointment_id: null });
  });

  it("does nothing for any other status", async () => {
    const { client, checkupUpdates } = fakeClient();
    const result = await syncCheckupForAppointment(client, ACTOR, { id: "a-1", checkupId: "c-1", status: "proposed", startsAt: "2026-10-01T09:00:00Z" });
    expect(result).toBeNull();
    expect(checkupUpdates).toHaveLength(0);
  });
});
