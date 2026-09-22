import { describe, expect, it } from "vitest";

import { classifyRoutine, completeRoutine, createRoutine, dismissRoutine, reactivateRoutine, updateRoutine } from "./measurement-routines";

type Row = Record<string, unknown>;

const ACTOR = { householdId: "h-1", memberId: "m-1" };

const ROUTINE_ROW: Row = {
  id: "r-1",
  household_id: "h-1",
  member_id: "m-1",
  vital_type: "blood_pressure",
  custom_label: null,
  cadence_days: 7,
  preferred_time: "08:00",
  reminder_enabled: true,
  privacy_scope: "private",
  status: "active",
  next_due_on: "2026-09-22",
  last_completed_on: null,
  notes: null,
  created_by_member_id: "m-1",
  created_at: "2026-09-15T00:00:00.000Z",
  updated_at: "2026-09-15T00:00:00.000Z",
};

const VITAL_ROW: Row = {
  id: "v-1",
  household_id: "h-1",
  member_id: "m-1",
  vital_type: "blood_pressure",
  custom_label: null,
  value: 128,
  secondary_value: 82,
  unit: "mmHg",
  measured_at: "2026-09-22T00:00:00.000Z",
  privacy_scope: "private",
  status: "active",
  source_type: "manual_entry",
  provenance_id: "prov-1",
  routine_id: "r-1",
  notes: null,
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

function fakeClient() {
  const routineInserts: Row[] = [];
  const routineUpdates: Row[] = [];
  const vitalInserts: Row[] = [];
  let routineRow: Row = { ...ROUTINE_ROW };

  const client = {
    from: (table: string) => {
      if (table === "health_provenance") {
        return {
          insert: (row: Row) => {
            void row;
            return { select: () => ({ single: async () => ({ data: { id: "prov-1" }, error: null }) }) };
          },
        };
      }
      if (table === "health_vitals") {
        return {
          insert: (row: Row) => {
            vitalInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { ...VITAL_ROW, ...row }, error: null }) }) };
          },
        };
      }
      if (table === "health_measurement_routines") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              in: () => chain,
              order: async () => ({ data: [routineRow], error: null }),
              maybeSingle: async () => ({ data: routineRow, error: null }),
            };
            return chain;
          },
          insert: (row: Row) => {
            routineInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { ...ROUTINE_ROW, ...row }, error: null }) }) };
          },
          update: (patch: Row) => {
            routineUpdates.push(patch);
            routineRow = { ...routineRow, ...patch };
            return {
              eq: () => ({
                eq: () => ({ select: () => ({ single: async () => ({ data: routineRow, error: null }) }) }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as never, routineInserts, routineUpdates, vitalInserts };
}

describe("classifyRoutine", () => {
  const today = new Date("2026-09-22T00:00:00Z");

  it("is overdue when the due date has already passed", () => {
    expect(classifyRoutine({ status: "active", nextDueOn: "2026-09-01" }, today)).toBe("overdue");
  });

  it("is due soon, not yet overdue, on the due date itself", () => {
    expect(classifyRoutine({ status: "active", nextDueOn: "2026-09-22" }, today)).toBe("due_soon");
  });

  it("is due soon within the window", () => {
    expect(classifyRoutine({ status: "active", nextDueOn: "2026-10-01" }, today)).toBe("due_soon");
  });

  it("is silent when far in the future", () => {
    expect(classifyRoutine({ status: "active", nextDueOn: "2027-01-01" }, today)).toBe("silent");
  });

  it("is silent when dismissed, regardless of the date", () => {
    expect(classifyRoutine({ status: "dismissed", nextDueOn: "2026-09-01" }, today)).toBe("silent");
  });
});

describe("createRoutine", () => {
  it("inserts with the caller's own defaults", async () => {
    const { client, routineInserts } = fakeClient();
    await createRoutine(client, ACTOR, { memberId: "m-1", vitalType: "blood_pressure", cadenceDays: 7, nextDueOn: "2026-09-29", privacyScope: "private" });
    expect(routineInserts[0]).toMatchObject({ created_by_member_id: "m-1", reminder_enabled: true });
  });
});

describe("updateRoutine", () => {
  it("only patches the fields provided", async () => {
    const { client, routineUpdates } = fakeClient();
    await updateRoutine(client, ACTOR, "r-1", { cadenceDays: 14 });
    expect(routineUpdates[0]).toEqual({ cadence_days: 14 });
  });
});

describe("dismissRoutine / reactivateRoutine", () => {
  it("dismisses without deleting the routine", async () => {
    const { client, routineUpdates } = fakeClient();
    const result = await dismissRoutine(client, ACTOR, "r-1");
    expect(result.status).toBe("dismissed");
    expect(routineUpdates[0]).toEqual({ status: "dismissed" });
  });

  it("brings a dismissed routine back", async () => {
    const { client, routineUpdates } = fakeClient();
    const result = await reactivateRoutine(client, ACTOR, "r-1");
    expect(result.status).toBe("active");
    expect(routineUpdates[0]).toEqual({ status: "active" });
  });
});

describe("completeRoutine", () => {
  it("records the reading against the routine and advances next_due_on by its own cadence", async () => {
    const { client, vitalInserts, routineUpdates } = fakeClient();
    const result = await completeRoutine(client, ACTOR, "r-1", { value: 128, secondaryValue: 82, unit: "mmHg" }, "2026-09-22");

    expect(vitalInserts[0]).toMatchObject({ vital_type: "blood_pressure", value: 128, secondary_value: 82, unit: "mmHg", routine_id: "r-1" });
    expect(routineUpdates[0]).toEqual({ last_completed_on: "2026-09-22", next_due_on: "2026-09-29" });
    expect(result.routine.nextDueOn).toBe("2026-09-29");
    expect(result.routine.lastCompletedOn).toBe("2026-09-22");
    expect(result.vital.routineId).toBe("r-1");
  });
});
