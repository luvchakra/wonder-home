import { describe, expect, it } from "vitest";

import type { ConnectorError, ProviderRecord } from "../integrations/connector";
import type { Connection, IdentityMapping } from "../integrations/repository";
import { createFixtureSchoolConnector, type SchoolPayload, type TranslatedSchoolItem } from "./connector";
import {
  planSchoolItemsSync,
  syncSchool,
  type ExistingSchoolItemImport,
  type SchoolItemsSyncPlan,
  type SchoolSyncPorts,
} from "./school-sync";

const NOW = new Date("2026-09-19T09:00:00.000Z");

const record = (
  externalId = "msg-1",
  over: Partial<SchoolPayload> = {},
  hash = "a".repeat(64),
): ProviderRecord<SchoolPayload> => ({
  externalId,
  contentHash: hash,
  type: "assignment",
  observedAt: NOW,
  payload: {
    externalChildId: "student-77",
    kind: "homework",
    title: "Maths worksheet",
    subject: "Maths",
    dueAt: "2026-09-20T08:00:00.000Z",
    ...over,
  },
});

const mappings: IdentityMapping[] = [{ externalId: "student-77", memberId: "aarav" }];

const connection: Connection = {
  id: "int-1",
  householdId: "hh-1",
  kind: "school",
  provider: "example_school",
  credentialRef: "secret-manager://school/hh-1",
  scopes: [],
  state: { status: "connected", consecutiveFailures: 0, lastErrorCode: null },
};

function memoryPorts(existing: ExistingSchoolItemImport[] = [], seen: string[] = []) {
  const calls = { applied: [] as SchoolItemsSyncPlan[], events: [] as string[], outcomes: [] as unknown[] };
  const ports: SchoolSyncPorts = {
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

describe("a school sync", () => {
  it("imports recognised work, records it, and marks the connection healthy", async () => {
    const connector = createFixtureSchoolConnector({ provider: "example_school", records: [record()] });
    const { ports, calls } = memoryPorts();

    const report = await syncSchool({ connector, connection, mappings, ports });

    expect(report).toMatchObject({ ok: true, inserted: 1, updated: 0, cancelled: 0, unmatched: 0 });
    expect(report.state.status).toBe("connected");
    expect(calls.applied[0]?.insert.map((item) => item.externalId)).toEqual(["msg-1"]);
    expect(calls.events).toEqual(["msg-1:processed"]);
  });

  it("touches no canonical state when the provider fails, and only the health changes", async () => {
    const outage: ConnectorError = { code: "unavailable", retryable: true, message: "Portal down." };
    const connector = createFixtureSchoolConnector({ provider: "example_school", failWith: outage });
    const { ports, calls } = memoryPorts();

    const report = await syncSchool({ connector, connection, mappings, ports });

    expect(report.ok).toBe(false);
    expect(report.error).toEqual(outage);
    expect(calls.applied).toEqual([]);
    expect(calls.events).toEqual([]);
  });

  it("leaves an unmapped child's records unmatched and records them as ignored, not lost", async () => {
    const connector = createFixtureSchoolConnector({
      provider: "example_school",
      records: [record("msg-1", { externalChildId: "unknown-student" })],
    });
    const { ports, calls } = memoryPorts();

    const report = await syncSchool({ connector, connection, mappings, ports });

    expect(report).toMatchObject({ inserted: 0, unmatched: 1 });
    expect(calls.events).toEqual(["msg-1:ignored"]);
  });

  it("re-syncing unchanged records writes nothing", async () => {
    const connector = createFixtureSchoolConnector({ provider: "example_school", records: [record()] });
    const { ports } = memoryPorts([{ id: "row-1", externalId: "msg-1", status: "pending" }], ["msg-1:" + "a".repeat(64)]);

    const report = await syncSchool({ connector, connection, mappings, ports });

    expect(report).toMatchObject({ unchanged: 1, inserted: 0, updated: 0 });
  });

  it("refuses a connector of the wrong kind", async () => {
    const connector = { ...createFixtureSchoolConnector({ provider: "x" }), kind: "calendar" as const };
    const { ports } = memoryPorts();

    await expect(syncSchool({ connector, connection, mappings, ports })).rejects.toThrow("calendar connector");
  });
});

const item = (over: Partial<TranslatedSchoolItem> = {}, externalId = "msg-1", contentHash = "a".repeat(64)): TranslatedSchoolItem => ({
  childMemberId: "aarav",
  kind: "homework",
  title: "Maths worksheet",
  subject: "Maths",
  detail: null,
  dueAt: null,
  estimatedMinutes: null,
  estimateSource: null,
  provider: "example_school",
  externalId,
  contentHash,
  providerCancelled: false,
  ...over,
});

describe("planning what a school sync should change", () => {
  it("cancels an item the provider withdrew, when nobody has submitted or finished it", () => {
    const existing: ExistingSchoolItemImport[] = [{ id: "row-1", externalId: "msg-1", status: "pending" }];
    const plan = planSchoolItemsSync(existing, new Set(), [item({ providerCancelled: true })]);

    expect(plan.update).toEqual([{ id: "row-1", item: expect.objectContaining({ externalId: "msg-1" }), cancel: true }]);
  });

  it("never lets a provider's cancellation override a child's own completion", () => {
    const existing: ExistingSchoolItemImport[] = [{ id: "row-1", externalId: "msg-1", status: "done" }];
    const plan = planSchoolItemsSync(existing, new Set(), [item({ providerCancelled: true })]);

    expect(plan.update).toEqual([{ id: "row-1", item: expect.objectContaining({ externalId: "msg-1" }), cancel: false }]);
  });

  it("inserts a new, already-cancelled item directly — there is nobody's completion to protect yet", () => {
    const plan = planSchoolItemsSync([], new Set(), [item({ providerCancelled: true })]);

    expect(plan.insert).toHaveLength(1);
    expect(plan.update).toEqual([]);
  });

  it("updates content only, with cancel false, for an ordinary re-sync", () => {
    const existing: ExistingSchoolItemImport[] = [{ id: "row-1", externalId: "msg-1", status: "pending" }];
    const plan = planSchoolItemsSync(existing, new Set(), [item({ title: "Maths worksheet (revised)" }, "msg-1", "b".repeat(64))]);

    expect(plan.update).toEqual([{ id: "row-1", item: expect.objectContaining({ title: "Maths worksheet (revised)" }), cancel: false }]);
  });
});
