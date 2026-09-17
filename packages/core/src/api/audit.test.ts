import { describe, expect, it, vi } from "vitest";

import { setLogSink, type LogRecord } from "../observability/logger";
import { AUDIT_EVENTS, recordAuditEvent } from "./audit";

type AuditRow = { metadata: Record<string, unknown> } & Record<string, unknown>;

function fakeClient(result: { error?: { code: string } } = {}) {
  const insert = vi.fn(async (_row: AuditRow) => result);
  return { client: { from: () => ({ insert }) } as never, insert };
}

describe("audit hooks", () => {
  it("records who did what to which record", async () => {
    const { client, insert } = fakeClient();

    await recordAuditEvent(client, {
      householdId: "h-1",
      eventType: "member.role_granted",
      actorMemberId: "m-1",
      targetTable: "household_roles",
      targetId: "r-1",
      requestId: "req-1",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: "h-1",
        event_type: "member.role_granted",
        actor_member_id: "m-1",
        target_table: "household_roles",
        target_id: "r-1",
      }),
    );
  });

  it("redacts metadata, so an audit row cannot become a side channel", async () => {
    const { client, insert } = fakeClient();

    await recordAuditEvent(client, {
      householdId: "h-1",
      eventType: "invitation.created",
      metadata: { role: "adult", token: "sb_secret_abcdefghijklmnop", transcript: "private talk" },
    });

    const written = insert.mock.calls[0]![0];
    expect(written.metadata.role).toBe("adult");
    expect(written.metadata.token).toBe("[redacted]");
    expect(written.metadata.transcript).toBe("[redacted]");
  });

  it("carries the request id, so a trail entry ties back to one request", async () => {
    const { client, insert } = fakeClient();
    await recordAuditEvent(client, {
      householdId: "h-1",
      eventType: "child.created",
      requestId: "req-42",
    });

    const written = insert.mock.calls[0]![0];
    expect(written.metadata.requestId).toBe("req-42");
  });

  it("never throws, because a failed audit write must not fail a completed action", async () => {
    const records: LogRecord[] = [];
    setLogSink((record) => records.push(record));

    const { client } = fakeClient({ error: { code: "23503" } });

    await expect(
      recordAuditEvent(client, { householdId: "h-1", eventType: "member.added" }),
    ).resolves.toBeUndefined();

    expect(records.some((record) => record.message === "audit write failed")).toBe(true);
    setLogSink(null);
  });

  it("names its event types, so a typo is a type error rather than a silent gap", () => {
    expect(AUDIT_EVENTS).toContain("invitation.accepted");
    expect(new Set(AUDIT_EVENTS).size).toBe(AUDIT_EVENTS.length);
  });
});
