import { beforeEach, describe, expect, it } from "vitest";

import {
  applySyncOutcome,
  connectionNeedsAttention,
  dedupeKey,
  describeStatus,
  newRecords,
  retryDelaySeconds,
  type ConnectionState,
  type ConnectorError,
  type ProviderRecord,
} from "./connector";
import {
  clearConnectors,
  connectorsOfKind,
  contentHash,
  createFixtureConnector,
  getConnector,
  registerConnector,
} from "./registry";

const connected: ConnectionState = {
  status: "connected",
  consecutiveFailures: 0,
  lastErrorCode: null,
};

const outage: ConnectorError = {
  code: "unavailable",
  retryable: true,
  message: "The provider is not responding.",
};

const record = (over: Partial<ProviderRecord<{ title: string }>> = {}): ProviderRecord<{ title: string }> => ({
  externalId: "assignment-1",
  contentHash: "a".repeat(64),
  type: "assignment",
  observedAt: new Date("2026-09-17T08:00:00.000Z"),
  payload: { title: "Science project" },
  ...over,
});

describe("how a sync outcome moves a connection", () => {
  it("a clean sync means connected", () => {
    expect(applySyncOutcome(connected, { ok: true, partialFailures: [] })).toMatchObject({
      status: "connected",
      consecutiveFailures: 0,
    });
  });

  it("a partial failure is degraded, not failed — the records that arrived are real", () => {
    expect(applySyncOutcome(connected, { ok: true, partialFailures: [outage] })).toMatchObject({
      status: "degraded",
      lastErrorCode: "unavailable",
    });
  });

  it("one outage is weather; three in a row is a problem", () => {
    let state = connected;
    state = applySyncOutcome(state, { ok: false, error: outage });
    expect(state.status).toBe("degraded");

    state = applySyncOutcome(state, { ok: false, error: outage });
    expect(state.status).toBe("degraded");

    state = applySyncOutcome(state, { ok: false, error: outage });
    expect(state).toMatchObject({ status: "error", consecutiveFailures: 3 });
  });

  it("lost access does not wait for a threshold, because only a person can fix it", () => {
    const revoked: ConnectorError = { code: "revoked", retryable: false, message: "Access was withdrawn." };

    expect(applySyncOutcome(connected, { ok: false, error: revoked }).status).toBe("revoked");
    expect(
      applySyncOutcome(connected, {
        ok: false,
        error: { code: "unauthorized", retryable: false, message: "Not authorized." },
      }).status,
    ).toBe("revoked");
  });

  it("a success clears the failure streak", () => {
    const failing = applySyncOutcome(connected, { ok: false, error: outage });

    expect(applySyncOutcome(failing, { ok: true, partialFailures: [] }).consecutiveFailures).toBe(0);
  });
});

describe("what the household hears about", () => {
  it("says nothing while WonderHome is still retrying", () => {
    expect(connectionNeedsAttention({ ...connected, status: "degraded", consecutiveFailures: 1 })).toBe(
      false,
    );
  });

  it("speaks up when access is gone or the connection has given up", () => {
    expect(connectionNeedsAttention({ ...connected, status: "revoked" })).toBe(true);
    expect(connectionNeedsAttention({ ...connected, status: "error" })).toBe(true);
  });

  it("describes a status without naming the provider's internals", () => {
    expect(describeStatus("revoked")).toBe("Access needs granting again");
    expect(describeStatus("degraded")).toBe("Working, with some problems");
  });
});

describe("retrying", () => {
  it("honours a provider's own Retry-After, because ignoring it earns a ban", () => {
    expect(retryDelaySeconds({ code: "rate_limited", retryable: true, message: "Slow down.", retryAfterSeconds: 120 }, 1)).toBe(
      120,
    );
  });

  it("backs off, and caps", () => {
    expect(retryDelaySeconds(outage, 0)).toBe(30);
    expect(retryDelaySeconds(outage, 2)).toBe(120);
    expect(retryDelaySeconds(outage, 20)).toBe(3600);
  });

  it("does not retry what retrying cannot fix", () => {
    expect(retryDelaySeconds({ code: "unauthorized", retryable: false, message: "No." }, 1)).toBeNull();
  });
});

describe("deduplication", () => {
  it("keys on provider identity and content, so a changed item is new work", () => {
    const seen = new Set([dedupeKey(record())]);

    expect(newRecords([record()], seen)).toHaveLength(0);
    expect(newRecords([record({ contentHash: "b".repeat(64) })], seen)).toHaveLength(1);
  });

  it("does not collapse two items that merely look alike", () => {
    const seen = new Set([dedupeKey(record())]);

    expect(newRecords([record({ externalId: "assignment-2" })], seen)).toHaveLength(1);
  });
});

describe("the fixture connector", () => {
  beforeEach(() => clearConnectors());

  it("never claims to be live, so the product cannot imply a connection it lacks", () => {
    const connector = createFixtureConnector({ provider: "example_school", kind: "school" });

    expect(connector.live).toBe(false);
  });

  it("returns what it was given, with no network", async () => {
    const connector = createFixtureConnector({
      provider: "example_school",
      kind: "school",
      records: [record()],
    });

    const result = await connector.sync({ householdId: "h", credentialRef: null, scopes: [] });
    expect(result.records).toHaveLength(1);
    expect(result.partialFailures).toEqual([]);
  });

  it("refuses a scope the household never granted, and does not call it an outage", async () => {
    const connector = createFixtureConnector({
      provider: "example_school",
      kind: "school",
      requiredScopes: ["assignments.read"],
    });

    await expect(
      connector.sync({ householdId: "h", credentialRef: null, scopes: [] }),
    ).rejects.toMatchObject({ code: "unauthorized", retryable: false });
  });

  it("revokes even when the provider would not answer", async () => {
    const connector = createFixtureConnector({
      provider: "example_school",
      kind: "school",
      failWith: outage,
    });

    await expect(
      connector.revoke({ householdId: "h", credentialRef: null, scopes: [] }),
    ).resolves.toMatchObject({ revoked: true });
  });

  it("is found by kind and provider once registered", () => {
    const connector = createFixtureConnector({ provider: "example_school", kind: "school" });
    registerConnector(connector);

    expect(getConnector("school", "example_school")).toBe(connector);
    expect(connectorsOfKind("school")).toHaveLength(1);
    expect(getConnector("commerce", "example_school")).toBeNull();
  });
});

describe("content hashing", () => {
  it("is stable for the same payload and different for a changed one", async () => {
    const first = await contentHash({ title: "Science project", due: "2026-09-19" });
    const same = await contentHash({ title: "Science project", due: "2026-09-19" });
    const changed = await contentHash({ title: "Science project", due: "2026-09-20" });

    expect(first).toBe(same);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
