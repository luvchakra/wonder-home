import { describe, expect, it } from "vitest";

import type { ProviderRecord } from "../integrations/connector";
import {
  createFixtureSchoolConnector,
  describeSchoolHealth,
  translate,
  type SchoolPayload,
} from "./connector";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const record = (over: Partial<SchoolPayload> = {}, externalId = "portal-1"): ProviderRecord<SchoolPayload> => ({
  externalId,
  contentHash: "a".repeat(64),
  type: "assignment",
  observedAt: NOW,
  payload: {
    externalChildId: "student-77",
    kind: "homework",
    title: "Maths worksheet",
    subject: "Maths",
    dueAt: "2026-09-18T08:00:00.000Z",
    ...over,
  },
});

const mappings = [{ externalChildId: "student-77", childMemberId: "aarav" }];

describe("translating what a portal sent", () => {
  it("produces canonical items that carry the provider's identity for dedupe", () => {
    const { items } = translate([record()], mappings, "example_school");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      childMemberId: "aarav",
      kind: "homework",
      title: "Maths worksheet",
      provider: "example_school",
      externalId: "portal-1",
    });
  });

  it("never guesses which child a record belongs to", () => {
    const { items, unmatched } = translate([record({ externalChildId: "student-99" })], mappings, "example_school");

    expect(items).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });

  it("produces nothing that says work is finished", () => {
    const { items } = translate([record()], mappings, "example_school");

    expect(items[0]).not.toHaveProperty("status");
    expect(items[0]).not.toHaveProperty("completedAt");
  });

  it("marks a provider-supplied estimate as the provider's", () => {
    const { items } = translate([record({ estimatedMinutes: 40 })], mappings, "example_school");

    expect(items[0]).toMatchObject({ estimatedMinutes: 40, estimateSource: "provider" });
  });

  it("carries the record's content hash, for a reconciler to tell unchanged from corrected", () => {
    const { items } = translate([record()], mappings, "example_school");

    expect(items[0]?.contentHash).toBe("a".repeat(64));
  });

  it("flags a provider's own cancellation signal without deciding what to do about it", () => {
    const { items } = translate([record({ status: "cancelled" })], mappings, "example_school");

    expect(items[0]?.providerCancelled).toBe(true);
  });

  it("leaves providerCancelled false for ordinary work", () => {
    const { items } = translate([record()], mappings, "example_school");

    expect(items[0]?.providerCancelled).toBe(false);
  });

  it("drops a malformed date rather than inventing a deadline", () => {
    const { items } = translate([record({ dueAt: "not a date" })], mappings, "example_school");

    expect(items[0]?.dueAt).toBeNull();
  });
});

describe("the fixture school connector", () => {
  it("does not claim to be live", () => {
    expect(createFixtureSchoolConnector({ provider: "example_school" }).live).toBe(false);
  });

  it("hands back the records it was given", async () => {
    const connector = createFixtureSchoolConnector({
      provider: "example_school",
      records: [record()],
    });

    const result = await connector.sync({ householdId: "h", credentialRef: null, scopes: [] });
    expect(result.records).toHaveLength(1);
  });

  it("reports a partial sync as records plus failures, not as nothing at all", async () => {
    const connector = createFixtureSchoolConnector({
      provider: "example_school",
      records: [record()],
      partialFailures: [{ code: "unavailable", retryable: true, message: "One class did not load." }],
    });

    const result = await connector.sync({ householdId: "h", credentialRef: null, scopes: [] });
    expect(result.records).toHaveLength(1);
    expect(result.partialFailures).toHaveLength(1);
  });
});

describe("telling a household about a broken school connection", () => {
  it("says nothing while it is working", () => {
    expect(describeSchoolHealth({ status: "connected", lastSuccessAt: NOW }).tone).toBe("silent");
  });

  it("warns that the list may be incomplete rather than letting it look empty", () => {
    const health = describeSchoolHealth({
      status: "degraded",
      lastSuccessAt: new Date("2026-09-16T09:00:00.000Z"),
      now: NOW,
    });

    expect(health.tone).toBe("informational");
    expect(health.message).toContain("may be incomplete");
    expect(health.message).toContain("24 hours ago");
  });

  it("asks for a person when only a person can fix it", () => {
    expect(describeSchoolHealth({ status: "revoked", lastSuccessAt: null }).tone).toBe("needs_action");
    expect(describeSchoolHealth({ status: "error", lastSuccessAt: null }).tone).toBe("needs_action");
  });

  it("does not nag a household that never connected a school at all", () => {
    expect(describeSchoolHealth({ status: "not_connected", lastSuccessAt: null }).tone).toBe("silent");
  });
});
