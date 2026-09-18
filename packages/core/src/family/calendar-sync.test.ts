import { describe, expect, it } from "vitest";

import type { ConnectorError, ProviderRecord } from "../integrations/connector";
import type { Connection } from "../integrations/repository";
import {
  createFixtureCalendarConnector,
  type CalendarPayload,
  type ExistingImport,
  type ReconciliationPlan,
} from "./calendar-connector";
import { syncCalendar, toConnectorError, type CalendarSyncPorts } from "./calendar-sync";

const NOW = new Date("2026-09-18T09:00:00.000Z");

const record = (externalId: string, over: Partial<CalendarPayload> = {}, hash = "a".repeat(64)): ProviderRecord<CalendarPayload> => ({
  externalId,
  contentHash: hash,
  type: "event",
  observedAt: NOW,
  payload: {
    externalCalendarId: "priya@example",
    title: "Dentist",
    startsAt: "2026-09-19T10:00:00.000Z",
    endsAt: "2026-09-19T11:00:00.000Z",
    ...over,
  },
});

const mappings = [{ externalId: "priya@example", memberId: "priya" }];

const connection: Connection = {
  id: "int-1",
  householdId: "hh-1",
  kind: "calendar",
  provider: "example_calendar",
  credentialRef: "secret-manager://calendar/hh-1",
  scopes: ["calendar.events.read"],
  state: { status: "connected", consecutiveFailures: 0, lastErrorCode: null },
};

/** In-memory ports that remember every call, so a test can assert what was and was not touched. */
function memoryPorts(existing: ExistingImport[] = [], seen: string[] = []) {
  const calls = { applied: [] as ReconciliationPlan[], events: [] as string[], outcomes: [] as unknown[] };
  const ports: CalendarSyncPorts = {
    existingImports: async () => existing,
    seenKeys: async () => new Set(seen),
    apply: async (plan) => {
      calls.applied.push(plan);
    },
    recordEvents: async (entries) => {
      calls.events.push(...entries.map((entry) => `${entry.record.externalId}:${entry.status}`));
    },
    recordOutcome: async (outcome) => {
      calls.outcomes.push(outcome);
      if (outcome.ok) {
        return { status: outcome.partialFailures.length ? "degraded" : "connected", consecutiveFailures: 0, lastErrorCode: null };
      }
      return { status: "degraded", consecutiveFailures: 1, lastErrorCode: outcome.error.code };
    },
  };
  return { ports, calls };
}

describe("a calendar sync", () => {
  it("imports what the provider sent, records it, and marks the connection healthy", async () => {
    const connector = createFixtureCalendarConnector({ provider: "example_calendar", records: [record("e1")] });
    const { ports, calls } = memoryPorts();

    const report = await syncCalendar({ connector, connection, mappings, ports });

    expect(report).toMatchObject({ ok: true, inserted: 1, updated: 0, cancelled: 0, unmatched: 0 });
    expect(report.state.status).toBe("connected");
    expect(calls.applied[0]?.insert.map((event) => event.externalId)).toEqual(["e1"]);
    expect(calls.events).toEqual(["e1:processed"]);
  });

  it("touches no canonical state when the provider fails, and only the health changes", async () => {
    const outage: ConnectorError = { code: "unavailable", retryable: true, message: "Provider down." };
    const connector = createFixtureCalendarConnector({ provider: "example_calendar", failWith: outage });
    const { ports, calls } = memoryPorts([{ id: "row-1", externalId: "e1", status: "planned" }]);

    const report = await syncCalendar({ connector, connection, mappings, ports });

    expect(report.ok).toBe(false);
    expect(report.error).toEqual(outage);
    expect(calls.applied).toEqual([]);
    expect(calls.events).toEqual([]);
    expect(calls.outcomes).toEqual([{ ok: false, error: outage }]);
  });

  it("cancels nothing after a partial sync and reports the connection as degraded", async () => {
    const connector = createFixtureCalendarConnector({
      provider: "example_calendar",
      records: [record("e1")],
      partialFailures: [{ code: "rate_limited", retryable: true, message: "One calendar was throttled.", retryAfterSeconds: 60 }],
    });
    const { ports, calls } = memoryPorts([{ id: "row-2", externalId: "vanished", status: "planned" }]);

    const report = await syncCalendar({ connector, connection, mappings, ports });

    expect(report).toMatchObject({ ok: true, partialFailures: 1, cancelled: 0 });
    expect(report.state.status).toBe("degraded");
    expect(calls.applied[0]?.cancel).toEqual([]);
  });

  it("cancels an event the provider withdrew, once the sync was complete", async () => {
    const connector = createFixtureCalendarConnector({ provider: "example_calendar", records: [record("e1")] });
    const { ports, calls } = memoryPorts([{ id: "row-2", externalId: "vanished", status: "planned" }]);

    const report = await syncCalendar({ connector, connection, mappings, ports });

    expect(report.cancelled).toBe(1);
    expect(calls.applied[0]?.cancel).toEqual(["row-2"]);
  });

  it("re-syncing unchanged records writes nothing", async () => {
    const connector = createFixtureCalendarConnector({ provider: "example_calendar", records: [record("e1")] });
    const { ports, calls } = memoryPorts([{ id: "row-1", externalId: "e1", status: "planned" }], ["e1:" + "a".repeat(64)]);

    const report = await syncCalendar({ connector, connection, mappings, ports });

    expect(report).toMatchObject({ unchanged: 1, inserted: 0, updated: 0 });
    expect(calls.applied[0]).toMatchObject({ insert: [], update: [], cancel: [] });
  });

  it("leaves an unmapped calendar's records unmatched and records them as ignored, not lost", async () => {
    const connector = createFixtureCalendarConnector({
      provider: "example_calendar",
      records: [record("e1", { externalCalendarId: "unknown@example" })],
    });
    const { ports, calls } = memoryPorts();

    const report = await syncCalendar({ connector, connection, mappings, ports });

    expect(report).toMatchObject({ inserted: 0, unmatched: 1 });
    expect(calls.events).toEqual(["e1:ignored"]);
  });

  it("treats a missing scope as lost access, which a person has to fix", async () => {
    const connector = createFixtureCalendarConnector({
      provider: "example_calendar",
      requiredScopes: ["calendar.events.read", "calendar.freebusy.read"],
      records: [record("e1")],
    });
    const { ports, calls } = memoryPorts();

    const report = await syncCalendar({ connector, connection, mappings, ports });

    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe("unauthorized");
    expect(calls.applied).toEqual([]);
  });

  it("refuses a connector of the wrong kind", async () => {
    const connector = { ...createFixtureCalendarConnector({ provider: "x" }), kind: "school" as const };
    const { ports } = memoryPorts();

    await expect(syncCalendar({ connector, connection, mappings, ports })).rejects.toThrow("school connector");
  });
});

describe("what a thrown thing becomes", () => {
  it("passes a contract error through", () => {
    const error: ConnectorError = { code: "timeout", retryable: true, message: "Slow." };
    expect(toConnectorError(error)).toBe(error);
  });

  it("never passes provider prose on — an SDK exception could carry a token", () => {
    const converted = toConnectorError(new Error("401 for token ya29.secret"));

    expect(converted.code).toBe("unavailable");
    expect(converted.message).not.toContain("ya29");
  });
});
