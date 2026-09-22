import { describe, expect, it } from "vitest";

import { archiveVital, createVital, type HealthVital, describeVitalTrend, reactivateVital, summarizeVitalTrend, updateVital } from "./vitals";

type Row = Record<string, unknown>;

const ACTOR = { householdId: "h-1", memberId: "m-1" };

const VITAL_ROW: Row = {
  id: "v-1",
  household_id: "h-1",
  member_id: "m-1",
  vital_type: "weight",
  custom_label: null,
  value: 72,
  secondary_value: null,
  unit: "kg",
  measured_at: "2026-09-22T08:00:00.000Z",
  privacy_scope: "private",
  status: "active",
  source_type: "manual_entry",
  provenance_id: "prov-1",
  routine_id: null,
  notes: null,
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

function fakeClient() {
  const provenanceInserts: Row[] = [];
  const vitalInserts: Row[] = [];
  const vitalUpdates: Row[] = [];
  let vitalRow: Row = { ...VITAL_ROW };

  const client = {
    from: (table: string) => {
      if (table === "health_provenance") {
        return {
          insert: (row: Row) => {
            provenanceInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "prov-1" }, error: null }) }) };
          },
        };
      }
      if (table === "health_vitals") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: async () => ({ data: [vitalRow], error: null }),
              maybeSingle: async () => ({ data: vitalRow, error: null }),
            };
            return chain;
          },
          insert: (row: Row) => {
            vitalInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { ...VITAL_ROW, ...row }, error: null }) }) };
          },
          update: (patch: Row) => {
            vitalUpdates.push(patch);
            vitalRow = { ...vitalRow, ...patch };
            return {
              eq: () => ({
                eq: () => ({ select: () => ({ single: async () => ({ data: vitalRow, error: null }) }) }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as never, provenanceInserts, vitalInserts, vitalUpdates };
}

describe("createVital", () => {
  it("records provenance and defaults to manual_entry source", async () => {
    const { client, provenanceInserts, vitalInserts } = fakeClient();
    await createVital(client, ACTOR, { memberId: "m-1", vitalType: "weight", value: 72, unit: "kg", privacyScope: "private" });
    expect(provenanceInserts[0]).toMatchObject({ source_type: "manual_entry", confirmed_by: "m-1" });
    expect(vitalInserts[0]).toMatchObject({ source_type: "manual_entry", created_by_member_id: "m-1" });
  });

  it("records home_talk provenance when logged through HomeTalk", async () => {
    const { client, provenanceInserts, vitalInserts } = fakeClient();
    await createVital(client, ACTOR, { memberId: "m-1", vitalType: "pulse", value: 72, unit: "bpm", privacyScope: "private", sourceType: "home_talk" });
    expect(provenanceInserts[0]).toMatchObject({ source_type: "home_talk" });
    expect(vitalInserts[0]).toMatchObject({ source_type: "home_talk" });
  });

  it("carries a paired secondary value for blood pressure", async () => {
    const { client, vitalInserts } = fakeClient();
    await createVital(client, ACTOR, { memberId: "m-1", vitalType: "blood_pressure", value: 128, secondaryValue: 82, unit: "mmHg", privacyScope: "private" });
    expect(vitalInserts[0]).toMatchObject({ value: 128, secondary_value: 82, unit: "mmHg" });
  });
});

describe("updateVital", () => {
  it("only patches the fields provided", async () => {
    const { client, vitalUpdates } = fakeClient();
    await updateVital(client, ACTOR, "v-1", { value: 73 });
    expect(vitalUpdates[0]).toEqual({ value: 73 });
  });
});

describe("archiveVital / reactivateVital", () => {
  it("archives a mis-entered reading without deleting it", async () => {
    const { client, vitalUpdates } = fakeClient();
    const result = await archiveVital(client, ACTOR, "v-1");
    expect(result.status).toBe("archived");
    expect(vitalUpdates[0]).toEqual({ status: "archived" });
  });

  it("brings an archived reading back", async () => {
    const { client, vitalUpdates } = fakeClient();
    const result = await reactivateVital(client, ACTOR, "v-1");
    expect(result.status).toBe("active");
    expect(vitalUpdates[0]).toEqual({ status: "active" });
  });
});

function vital(over: Partial<HealthVital>): HealthVital {
  return {
    id: "v-1",
    householdId: "h-1",
    memberId: "m-1",
    vitalType: "weight",
    customLabel: null,
    value: 72,
    secondaryValue: null,
    unit: "kg",
    measuredAt: "2026-09-22T08:00:00.000Z",
    privacyScope: "private",
    status: "active",
    sourceType: "manual_entry",
    provenanceId: "prov-1",
    routineId: null,
    notes: null,
    createdByMemberId: "m-1",
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...over,
  };
}

describe("summarizeVitalTrend / describeVitalTrend — verifiable arithmetic only, never a conclusion", () => {
  it("has nothing to say about an empty sample", () => {
    const trend = summarizeVitalTrend([]);
    expect(trend).toEqual({ count: 0, spanDays: null, latest: null, oldest: null });
    expect(describeVitalTrend(trend)).toBe("No readings yet.");
  });

  it("names a single reading without a span", () => {
    const trend = summarizeVitalTrend([vital({})]);
    expect(trend.count).toBe(1);
    expect(trend.spanDays).toBeNull();
    expect(describeVitalTrend(trend)).toBe("One reading so far.");
  });

  it("counts the calendar days between the oldest and newest reading, in days under two weeks", () => {
    const trend = summarizeVitalTrend([vital({ id: "v-1", measuredAt: "2026-09-20T08:00:00.000Z" }), vital({ id: "v-2", measuredAt: "2026-09-22T08:00:00.000Z" })]);
    expect(trend.count).toBe(2);
    expect(trend.spanDays).toBe(2);
    expect(describeVitalTrend(trend)).toBe("Your last 2 readings were recorded over the past 2 days.");
  });

  it("switches to weeks once the span reaches two weeks", () => {
    const trend = summarizeVitalTrend([vital({ id: "v-1", measuredAt: "2026-08-01T08:00:00.000Z" }), vital({ id: "v-2", measuredAt: "2026-09-22T08:00:00.000Z" })]);
    expect(trend.spanDays).toBe(52);
    expect(describeVitalTrend(trend)).toBe("Your last 2 readings were recorded over the past 7 weeks.");
  });

  it("says 'today' when every reading in the sample lands on the same calendar day", () => {
    const trend = summarizeVitalTrend([vital({ id: "v-1", measuredAt: "2026-09-22T07:00:00.000Z" }), vital({ id: "v-2", measuredAt: "2026-09-22T09:00:00.000Z" })]);
    expect(trend.spanDays).toBe(0);
    expect(describeVitalTrend(trend)).toBe("Your last 2 readings were all recorded today.");
  });

  it("identifies the latest and oldest reading regardless of input order", () => {
    const older = vital({ id: "v-old", measuredAt: "2026-09-01T08:00:00.000Z" });
    const newer = vital({ id: "v-new", measuredAt: "2026-09-22T08:00:00.000Z" });
    const trend = summarizeVitalTrend([older, newer]);
    expect(trend.latest?.id).toBe("v-new");
    expect(trend.oldest?.id).toBe("v-old");
  });
});
