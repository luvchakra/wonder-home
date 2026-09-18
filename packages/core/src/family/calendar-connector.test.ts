import { describe, expect, it } from "vitest";

import type { ProviderRecord } from "../integrations/connector";
import {
  createFixtureCalendarConnector,
  describeCalendarHealth,
  planReconciliation,
  PRIVATE_TITLE,
  translateCalendar,
  type CalendarPayload,
  type ExistingImport,
  type ImportedEvent,
} from "./calendar-connector";

const NOW = new Date("2026-09-18T09:00:00.000Z");

const record = (
  over: Partial<CalendarPayload> = {},
  externalId = "cal-evt-1",
  contentHash = "a".repeat(64),
): ProviderRecord<CalendarPayload> => ({
  externalId,
  contentHash,
  type: "event",
  observedAt: NOW,
  payload: {
    externalCalendarId: "priya@example",
    title: "Dentist",
    startsAt: "2026-09-19T10:00:00.000Z",
    endsAt: "2026-09-19T11:00:00.000Z",
    location: "Koramangala",
    ...over,
  },
});

const mappings = [
  { externalId: "priya@example", memberId: "priya" },
  { externalId: "rahul@example", memberId: "rahul" },
];

describe("translating what a calendar provider sent", () => {
  it("produces a canonical event owned by the mapped member, carrying the provider identity", () => {
    const { events } = translateCalendar([record()], mappings, "example_calendar");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Dentist",
      kind: "appointment",
      location: "Koramangala",
      ownerMemberId: "priya",
      participantMemberIds: ["priya"],
      provider: "example_calendar",
      externalId: "cal-evt-1",
      status: "planned",
    });
  });

  it("never marks an imported event as protected — that is a person's decision", () => {
    const { events } = translateCalendar([record()], mappings, "example_calendar");

    expect(events[0]).not.toHaveProperty("protected");
  });

  it("never confirms an event, even when the provider says it is confirmed", () => {
    const { events } = translateCalendar([record({ status: "confirmed" })], mappings, "example_calendar");

    expect(events[0]?.status).toBe("planned");
  });

  it("treats a tentative event as a proposal and a cancelled one as cancelled", () => {
    const { events } = translateCalendar(
      [record({ status: "tentative" }, "e1"), record({ status: "cancelled" }, "e2")],
      mappings,
      "example_calendar",
    );

    expect(events.map((event) => event.status)).toEqual(["proposed", "cancelled"]);
  });

  it("imports a private entry as time and nothing else", () => {
    const { events } = translateCalendar(
      [record({ private: true, title: "Therapy", location: "Clinic", kind: "gathering" })],
      mappings,
      "example_calendar",
    );

    expect(events[0]).toMatchObject({ title: PRIVATE_TITLE, location: null, kind: "appointment" });
    expect(JSON.stringify(events[0])).not.toContain("Therapy");
    expect(JSON.stringify(events[0])).not.toContain("Clinic");
  });

  it("never guesses whose calendar an event belongs to", () => {
    const { events, unmatched } = translateCalendar(
      [record({ externalCalendarId: "stranger@example" })],
      mappings,
      "example_calendar",
    );

    expect(events).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });

  it("maps attendees the household knows and drops the rest", () => {
    const { events } = translateCalendar(
      [record({ attendeeIds: ["rahul@example", "colleague@example", "priya@example"] })],
      mappings,
      "example_calendar",
    );

    expect(events[0]?.participantMemberIds).toEqual(["priya", "rahul"]);
  });

  it("skips a malformed or inverted time rather than inventing an event, and says why", () => {
    const { events, skipped } = translateCalendar(
      [
        record({ startsAt: "not a date" }, "bad-1"),
        record({ startsAt: "2026-09-19T11:00:00.000Z", endsAt: "2026-09-19T10:00:00.000Z" }, "bad-2"),
      ],
      mappings,
      "example_calendar",
    );

    expect(events).toEqual([]);
    expect(skipped.map((entry) => entry.reason)).toEqual([
      "The provider sent a time that could not be read.",
      "The provider sent an event that ends before it starts.",
    ]);
  });
});

describe("the fixture calendar connector", () => {
  it("does not claim to be live", () => {
    expect(createFixtureCalendarConnector({ provider: "example_calendar" }).live).toBe(false);
  });

  it("is a calendar connector", () => {
    expect(createFixtureCalendarConnector({ provider: "example_calendar" }).kind).toBe("calendar");
  });

  it("refuses to sync without the scope it needs, and says so as a permission problem", async () => {
    const connector = createFixtureCalendarConnector({
      provider: "example_calendar",
      requiredScopes: ["calendar.events.read"],
      records: [record()],
    });

    await expect(connector.sync({ householdId: "h", credentialRef: null, scopes: [] })).rejects.toMatchObject({
      code: "unauthorized",
      retryable: false,
    });
  });
});

const imported = (externalId: string, contentHash = "a".repeat(64)): ImportedEvent => ({
  externalId,
  contentHash,
  title: "Dentist",
  kind: "appointment",
  startsAt: new Date("2026-09-19T10:00:00.000Z"),
  endsAt: new Date("2026-09-19T11:00:00.000Z"),
  location: null,
  status: "planned",
  ownerMemberId: "priya",
  participantMemberIds: ["priya"],
  provider: "example_calendar",
});

const existing: ExistingImport[] = [
  { id: "row-1", externalId: "e1", status: "planned" },
  { id: "row-2", externalId: "e2", status: "planned" },
  { id: "row-3", externalId: "e3", status: "cancelled" },
];

describe("reconciling a sync against what is already there", () => {
  it("skips a record already seen with the same content, without a write", () => {
    const seen = new Set(["e1:" + "a".repeat(64)]);
    const plan = planReconciliation(existing, seen, [imported("e1")], { complete: true });

    expect(plan.unchanged).toBe(1);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("updates the row it already has when the content changed", () => {
    const seen = new Set(["e1:" + "a".repeat(64)]);
    const plan = planReconciliation(existing, seen, [imported("e1", "b".repeat(64))], { complete: true });

    expect(plan.update).toEqual([{ id: "row-1", event: expect.objectContaining({ externalId: "e1" }) }]);
    expect(plan.insert).toEqual([]);
  });

  it("inserts what it has never seen", () => {
    const plan = planReconciliation(existing, new Set(), [imported("e9")], { complete: true });

    expect(plan.insert.map((event) => event.externalId)).toEqual(["e9"]);
  });

  it("cancels, never deletes, an event the provider no longer has", () => {
    const plan = planReconciliation(existing, new Set(), [imported("e1")], { complete: true });

    expect(plan.cancel).toEqual(["row-2"]);
    expect(plan).not.toHaveProperty("delete");
  });

  it("cancels nothing after a partial sync, because what it missed is not what was withdrawn", () => {
    const plan = planReconciliation(existing, new Set(), [imported("e1")], { complete: false });

    expect(plan.cancel).toEqual([]);
  });

  it("does not touch an event that already happened or was already cancelled", () => {
    const rows: ExistingImport[] = [
      { id: "past", externalId: "p", status: "happened" },
      { id: "gone", externalId: "g", status: "cancelled" },
    ];
    const plan = planReconciliation(rows, new Set(), [], { complete: true });

    expect(plan.cancel).toEqual([]);
  });
});

describe("telling a household about a broken calendar connection", () => {
  it("says nothing while it is working", () => {
    expect(describeCalendarHealth({ status: "connected", lastSuccessAt: NOW }).tone).toBe("silent");
  });

  it("warns that availability may be stale rather than letting a stale calendar look free", () => {
    const health = describeCalendarHealth({
      status: "degraded",
      lastSuccessAt: new Date("2026-09-17T09:00:00.000Z"),
      now: NOW,
    });

    expect(health.tone).toBe("informational");
    expect(health.message).toContain("24 hours ago");
    expect(health.message).toContain("out of date");
  });

  it("asks for a person when only a person can fix it", () => {
    expect(describeCalendarHealth({ status: "revoked", lastSuccessAt: null }).tone).toBe("needs_action");
    expect(describeCalendarHealth({ status: "error", lastSuccessAt: null }).tone).toBe("needs_action");
  });

  it("does not nag a household that never connected a calendar", () => {
    expect(describeCalendarHealth({ status: "not_connected", lastSuccessAt: null }).tone).toBe("silent");
  });
});
