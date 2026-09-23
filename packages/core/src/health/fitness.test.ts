import { describe, expect, it } from "vitest";

import { ApiError } from "../api/errors";
import {
  archiveFitnessSession,
  countSessionsInCurrentPeriod,
  createFitnessGoal,
  createFitnessSession,
  dismissFitnessGoal,
  type FitnessGoal,
  reactivateFitnessGoal,
  reactivateFitnessSession,
  updateFitnessGoal,
  updateFitnessSession,
} from "./fitness";

type Row = Record<string, unknown>;

const ACTOR = { householdId: "h-1", memberId: "m-1" };

const GOAL_ROW: Row = {
  id: "g-1",
  household_id: "h-1",
  member_id: "m-1",
  activity_type: "walk",
  custom_label: null,
  target_count: 3,
  frequency_period: "week",
  preferred_time: null,
  privacy_scope: "private",
  status: "active",
  provider_id: "manual",
  provenance_id: "prov-1",
  notes: null,
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

const SESSION_ROW: Row = {
  id: "s-1",
  household_id: "h-1",
  member_id: "m-1",
  goal_id: null,
  activity_type: "walk",
  custom_label: null,
  duration_minutes: 30,
  distance_value: null,
  distance_unit: null,
  started_at: "2026-09-22T08:00:00.000Z",
  privacy_scope: "private",
  status: "active",
  provider_id: "manual",
  provenance_id: "prov-1",
  notes: null,
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

function fakeClient() {
  const provenanceInserts: Row[] = [];
  const goalInserts: Row[] = [];
  const goalUpdates: Row[] = [];
  const sessionInserts: Row[] = [];
  const sessionUpdates: Row[] = [];
  let goalRow: Row = { ...GOAL_ROW };
  let sessionRow: Row = { ...SESSION_ROW };

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
      if (table === "health_fitness_goals") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              maybeSingle: async () => ({ data: goalRow, error: null }),
            };
            return chain;
          },
          insert: (row: Row) => {
            goalInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { ...GOAL_ROW, ...row }, error: null }) }) };
          },
          update: (patch: Row) => {
            goalUpdates.push(patch);
            goalRow = { ...goalRow, ...patch };
            return {
              eq: () => ({
                eq: () => ({ select: () => ({ single: async () => ({ data: goalRow, error: null }) }) }),
              }),
            };
          },
        };
      }
      if (table === "health_fitness_sessions") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: async () => ({ data: [sessionRow], error: null }),
              maybeSingle: async () => ({ data: sessionRow, error: null }),
            };
            return chain;
          },
          insert: (row: Row) => {
            sessionInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { ...SESSION_ROW, ...row }, error: null }) }) };
          },
          update: (patch: Row) => {
            sessionUpdates.push(patch);
            sessionRow = { ...sessionRow, ...patch };
            return {
              eq: () => ({
                eq: () => ({ select: () => ({ single: async () => ({ data: sessionRow, error: null }) }) }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as never, provenanceInserts, goalInserts, goalUpdates, sessionInserts, sessionUpdates };
}

describe("createFitnessGoal", () => {
  it("records provenance and defaults to the manual provider", async () => {
    const { client, provenanceInserts, goalInserts } = fakeClient();
    await createFitnessGoal(client, ACTOR, { memberId: "m-1", activityType: "walk", targetCount: 3, frequencyPeriod: "week", privacyScope: "private" });
    expect(provenanceInserts[0]).toMatchObject({ source_type: "manual_entry", confirmed_by: "m-1" });
    expect(goalInserts[0]).toMatchObject({ provider_id: "manual", target_count: 3, frequency_period: "week" });
  });

  it("records home_talk provenance when set through HomeTalk", async () => {
    const { client, provenanceInserts, goalInserts } = fakeClient();
    await createFitnessGoal(client, ACTOR, { memberId: "m-1", activityType: "run", targetCount: 2, frequencyPeriod: "week", privacyScope: "private", providerId: "home_talk" });
    expect(provenanceInserts[0]).toMatchObject({ source_type: "home_talk" });
    expect(goalInserts[0]).toMatchObject({ provider_id: "home_talk" });
  });

  it("refuses a goal claiming a provider with no live connection", async () => {
    const { client } = fakeClient();
    await expect(
      createFitnessGoal(client, ACTOR, { memberId: "m-1", activityType: "walk", targetCount: 3, frequencyPeriod: "week", privacyScope: "private", providerId: "apple_health_kit" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("updateFitnessGoal", () => {
  it("only patches the fields provided", async () => {
    const { client, goalUpdates } = fakeClient();
    await updateFitnessGoal(client, ACTOR, "g-1", { targetCount: 4 });
    expect(goalUpdates[0]).toEqual({ target_count: 4 });
  });
});

describe("dismissFitnessGoal / reactivateFitnessGoal", () => {
  it("dismisses a goal without deleting it", async () => {
    const { client, goalUpdates } = fakeClient();
    const result = await dismissFitnessGoal(client, ACTOR, "g-1");
    expect(result.status).toBe("dismissed");
    expect(goalUpdates[0]).toEqual({ status: "dismissed" });
  });

  it("brings a dismissed goal back", async () => {
    const { client, goalUpdates } = fakeClient();
    const result = await reactivateFitnessGoal(client, ACTOR, "g-1");
    expect(result.status).toBe("active");
    expect(goalUpdates[0]).toEqual({ status: "active" });
  });
});

describe("createFitnessSession", () => {
  it("records provenance and defaults to the manual provider", async () => {
    const { client, provenanceInserts, sessionInserts } = fakeClient();
    await createFitnessSession(client, ACTOR, { memberId: "m-1", activityType: "walk", durationMinutes: 30, privacyScope: "private" });
    expect(provenanceInserts[0]).toMatchObject({ source_type: "manual_entry" });
    expect(sessionInserts[0]).toMatchObject({ provider_id: "manual", duration_minutes: 30 });
  });

  it("carries a paired distance value and unit", async () => {
    const { client, sessionInserts } = fakeClient();
    await createFitnessSession(client, ACTOR, { memberId: "m-1", activityType: "run", durationMinutes: 25, distanceValue: 5, distanceUnit: "km", privacyScope: "private" });
    expect(sessionInserts[0]).toMatchObject({ distance_value: 5, distance_unit: "km" });
  });

  it("refuses a distance value with no unit", async () => {
    const { client } = fakeClient();
    await expect(
      createFitnessSession(client, ACTOR, { memberId: "m-1", activityType: "run", durationMinutes: 25, distanceValue: 5, privacyScope: "private" }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("links a session to the goal it counts toward", async () => {
    const { client, sessionInserts } = fakeClient();
    await createFitnessSession(client, ACTOR, { memberId: "m-1", goalId: "g-1", activityType: "walk", durationMinutes: 30, privacyScope: "private" });
    expect(sessionInserts[0]).toMatchObject({ goal_id: "g-1" });
  });

  it("refuses a session claiming a provider with no live connection", async () => {
    const { client } = fakeClient();
    await expect(
      createFitnessSession(client, ACTOR, { memberId: "m-1", activityType: "walk", durationMinutes: 30, privacyScope: "private", providerId: "wearable" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("updateFitnessSession", () => {
  it("only patches the fields provided", async () => {
    const { client, sessionUpdates } = fakeClient();
    await updateFitnessSession(client, ACTOR, "s-1", { durationMinutes: 40 });
    expect(sessionUpdates[0]).toEqual({ duration_minutes: 40 });
  });

  it("refuses a distance update missing its unit", async () => {
    const { client } = fakeClient();
    await expect(updateFitnessSession(client, ACTOR, "s-1", { distanceValue: 5 })).rejects.toBeInstanceOf(ApiError);
  });

  it("allows clearing a distance by setting both to null", async () => {
    const { client, sessionUpdates } = fakeClient();
    await updateFitnessSession(client, ACTOR, "s-1", { distanceValue: null, distanceUnit: null });
    expect(sessionUpdates[0]).toEqual({ distance_value: null, distance_unit: null });
  });
});

describe("archiveFitnessSession / reactivateFitnessSession", () => {
  it("archives a session without deleting it", async () => {
    const { client, sessionUpdates } = fakeClient();
    const result = await archiveFitnessSession(client, ACTOR, "s-1");
    expect(result.status).toBe("archived");
    expect(sessionUpdates[0]).toEqual({ status: "archived" });
  });

  it("brings an archived session back", async () => {
    const { client, sessionUpdates } = fakeClient();
    const result = await reactivateFitnessSession(client, ACTOR, "s-1");
    expect(result.status).toBe("active");
    expect(sessionUpdates[0]).toEqual({ status: "active" });
  });
});

function goal(over: Partial<FitnessGoal>): FitnessGoal {
  return {
    id: "g-1",
    householdId: "h-1",
    memberId: "m-1",
    activityType: "walk",
    customLabel: null,
    targetCount: 3,
    frequencyPeriod: "week",
    preferredTime: null,
    privacyScope: "private",
    status: "active",
    providerId: "manual",
    provenanceId: "prov-1",
    notes: null,
    createdByMemberId: "m-1",
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...over,
  };
}

describe("countSessionsInCurrentPeriod — verifiable arithmetic, never a scored conclusion", () => {
  it("counts nothing outside the current week for a weekly goal", () => {
    const now = new Date("2026-09-24T12:00:00.000Z"); // a Thursday
    const count = countSessionsInCurrentPeriod(goal({ frequencyPeriod: "week" }), [{ startedAt: "2026-09-10T08:00:00.000Z" }], now);
    expect(count).toBe(0);
  });

  it("counts a session within the current week", () => {
    const now = new Date("2026-09-24T12:00:00.000Z"); // a Thursday
    const count = countSessionsInCurrentPeriod(goal({ frequencyPeriod: "week" }), [{ startedAt: "2026-09-22T08:00:00.000Z" }], now); // the Monday of that week
    expect(count).toBe(1);
  });

  it("counts within the current calendar month", () => {
    const now = new Date("2026-09-24T12:00:00.000Z");
    const count = countSessionsInCurrentPeriod(goal({ frequencyPeriod: "month" }), [{ startedAt: "2026-09-01T08:00:00.000Z" }, { startedAt: "2026-08-31T08:00:00.000Z" }], now);
    expect(count).toBe(1);
  });

  it("counts within today only for a daily goal", () => {
    const now = new Date("2026-09-24T18:00:00.000Z");
    const count = countSessionsInCurrentPeriod(goal({ frequencyPeriod: "day" }), [{ startedAt: "2026-09-24T06:00:00.000Z" }, { startedAt: "2026-09-23T20:00:00.000Z" }], now);
    expect(count).toBe(1);
  });
});
