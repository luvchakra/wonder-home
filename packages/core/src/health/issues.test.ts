import { describe, expect, it } from "vitest";

import { createIssue, setIssueStatus, updateIssue } from "./issues";

type Row = Record<string, unknown>;

const ACTOR = { householdId: "h-1", memberId: "m-1" };

const ISSUE_ROW: Row = {
  id: "i-1",
  household_id: "h-1",
  member_id: "m-1",
  label: "Sore throat",
  description: "Started yesterday",
  status: "mentioned",
  privacy_scope: "private",
  source_type: "manual_entry",
  provenance_id: "prov-1",
  notes: null,
  started_at: "2026-09-22",
  resolved_at: null,
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

function fakeClient() {
  const provenanceInserts: Row[] = [];
  const issueInserts: Row[] = [];
  const issueUpdates: Row[] = [];
  let errorCode: string | null = null;
  let issueRow: Row = { ...ISSUE_ROW };

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
      if (table === "health_issues") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              order: async () => ({ data: [issueRow], error: null }),
              maybeSingle: async () => ({ data: issueRow, error: null }),
            };
            return chain;
          },
          insert: (row: Row) => {
            issueInserts.push(row);
            return {
              select: () => ({
                single: async () =>
                  errorCode ? { data: null, error: { code: errorCode } } : { data: { ...ISSUE_ROW, ...row }, error: null },
              }),
            };
          },
          update: (patch: Row) => {
            issueUpdates.push(patch);
            issueRow = { ...issueRow, ...patch };
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () =>
                      errorCode ? { data: null, error: { code: errorCode } } : { data: issueRow, error: null },
                  }),
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return {
    client: client as never,
    provenanceInserts,
    issueInserts,
    issueUpdates,
    setError: (code: string | null) => {
      errorCode = code;
    },
  };
}

describe("createIssue", () => {
  it("creates a provenance row that never carries the issue's own content", async () => {
    const { client, provenanceInserts } = fakeClient();
    await createIssue(client, ACTOR, { memberId: "m-1", label: "Sore throat", privacyScope: "private" });

    expect(provenanceInserts[0]).toEqual({
      household_id: "h-1",
      source_type: "manual_entry",
      confidence: 1.0,
      confirmed_by: "m-1",
      confirmed_at: expect.any(String),
    });
    expect(JSON.stringify(provenanceInserts[0])).not.toContain("Sore throat");
  });

  it("links the new issue to the provenance row it just created", async () => {
    const { client, issueInserts } = fakeClient();
    await createIssue(client, ACTOR, { memberId: "m-1", label: "Sore throat", privacyScope: "private" });
    expect(issueInserts[0]!.provenance_id).toBe("prov-1");
  });

  it("recommends medical attention for a concerning description, without blocking the write", async () => {
    const { client } = fakeClient();
    const result = await createIssue(client, ACTOR, { memberId: "m-1", label: "Chest pain", privacyScope: "private" });
    expect(result.medicalAttention.recommend).toBe(true);
    expect(result.issue.id).toBe("i-1");
  });

  it("translates an RLS refusal into a household-facing message", async () => {
    const { client, setError } = fakeClient();
    setError("42501");
    await expect(createIssue(client, ACTOR, { memberId: "m-2", label: "Something", privacyScope: "private" })).rejects.toThrowError(/child you guard/);
  });
});

describe("updateIssue", () => {
  it("re-runs the medical-attention check against the updated content", async () => {
    const { client } = fakeClient();
    const result = await updateIssue(client, ACTOR, "i-1", { description: "Now having trouble breathing" });
    expect(result.medicalAttention.recommend).toBe(true);
  });
});

describe("setIssueStatus", () => {
  it("allows the normal forward transition", async () => {
    const { client, issueUpdates } = fakeClient();
    await setIssueStatus(client, ACTOR, "i-1", "active");
    expect(issueUpdates[0]).toEqual({ status: "active", resolved_at: null });
  });

  it("stamps resolved_at when moving to resolved", async () => {
    const { client, issueUpdates } = fakeClient();
    await setIssueStatus(client, ACTOR, "i-1", "resolved");
    expect(issueUpdates[0]!.status).toBe("resolved");
    expect(issueUpdates[0]!.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects a status that is not a real value", async () => {
    const { client } = fakeClient();
    // @ts-expect-error deliberately invalid for the test
    await expect(setIssueStatus(client, ACTOR, "i-1", "diagnosed")).rejects.toThrow();
  });
});
