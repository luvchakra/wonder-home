import { describe, expect, it } from "vitest";

import { findConflicts, findLikelyDuplicate, overlaps, type HealthAppointment, type TimeWindow } from "./appointments";

describe("overlaps", () => {
  it("is true when two windows genuinely overlap", () => {
    expect(overlaps("2026-10-01T09:00:00Z", "2026-10-01T10:00:00Z", "2026-10-01T09:30:00Z", "2026-10-01T11:00:00Z")).toBe(true);
  });

  it("is false for two windows that only touch at a boundary", () => {
    expect(overlaps("2026-10-01T09:00:00Z", "2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z")).toBe(false);
  });

  it("is false for two windows that do not overlap at all", () => {
    expect(overlaps("2026-10-01T09:00:00Z", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z")).toBe(false);
  });
});

describe("findConflicts", () => {
  const existing: TimeWindow[] = [
    { kind: "event", id: "e-1", label: "School pickup", startsAt: "2026-10-01T15:00:00Z", endsAt: "2026-10-01T16:00:00Z" },
    { kind: "health_appointment", id: "a-1", label: "an appointment", startsAt: "2026-10-01T09:00:00Z", endsAt: "2026-10-01T10:00:00Z" },
  ];

  it("finds every window the candidate overlaps", () => {
    const conflicts = findConflicts({ startsAt: "2026-10-01T09:30:00Z", endsAt: "2026-10-01T15:30:00Z" }, existing);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.with.id).sort()).toEqual(["a-1", "e-1"]);
  });

  it("finds nothing when the candidate fits between existing windows", () => {
    const conflicts = findConflicts({ startsAt: "2026-10-01T11:00:00Z", endsAt: "2026-10-01T12:00:00Z" }, existing);
    expect(conflicts).toEqual([]);
  });

  it("reports the actual overlap window, not the whole candidate", () => {
    const conflicts = findConflicts({ startsAt: "2026-10-01T09:30:00Z", endsAt: "2026-10-01T11:00:00Z" }, existing);
    expect(conflicts[0]!.overlapStartsAt).toBe("2026-10-01T09:30:00.000Z");
    expect(conflicts[0]!.overlapEndsAt).toBe("2026-10-01T10:00:00.000Z");
  });
});

function appointment(overrides: Partial<HealthAppointment>): HealthAppointment {
  return {
    id: "a-1",
    householdId: "h-1",
    memberId: "m-1",
    appointmentType: "dentist",
    status: "confirmed",
    privacyScope: "private",
    startsAt: "2026-10-10T09:00:00Z",
    endsAt: "2026-10-10T10:00:00Z",
    provider: null,
    facility: null,
    location: null,
    preparationNotes: null,
    notes: null,
    remindAdvance: true,
    remindPreparation: false,
    remindDayOf: true,
    calendarSync: false,
    familyEventId: null,
    rescheduledFromId: null,
    checkupId: null,
    createdByMemberId: "m-1",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("findLikelyDuplicate", () => {
  it("flags the same member and type within the duplicate window", () => {
    const existing = [appointment({})];
    const found = findLikelyDuplicate({ memberId: "m-1", appointmentType: "dentist", startsAt: "2026-10-11T09:00:00Z" }, existing);
    expect(found?.id).toBe("a-1");
  });

  it("does not flag a different member", () => {
    const existing = [appointment({ memberId: "m-2" })];
    const found = findLikelyDuplicate({ memberId: "m-1", appointmentType: "dentist", startsAt: "2026-10-11T09:00:00Z" }, existing);
    expect(found).toBeNull();
  });

  it("does not flag a different appointment type", () => {
    const existing = [appointment({ appointmentType: "doctor" })];
    const found = findLikelyDuplicate({ memberId: "m-1", appointmentType: "dentist", startsAt: "2026-10-11T09:00:00Z" }, existing);
    expect(found).toBeNull();
  });

  it("does not flag something well outside the duplicate window", () => {
    const existing = [appointment({})];
    const found = findLikelyDuplicate({ memberId: "m-1", appointmentType: "dentist", startsAt: "2026-11-01T09:00:00Z" }, existing);
    expect(found).toBeNull();
  });

  it("does not flag a cancelled appointment", () => {
    const existing = [appointment({ status: "cancelled" })];
    const found = findLikelyDuplicate({ memberId: "m-1", appointmentType: "dentist", startsAt: "2026-10-11T09:00:00Z" }, existing);
    expect(found).toBeNull();
  });
});
