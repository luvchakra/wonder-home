import { describe, expect, it } from "vitest";

import { archiveRecord, createRecord, reactivateRecord, updateRecord } from "./records";

type Row = Record<string, unknown>;

const ACTOR = { householdId: "h-1", memberId: "m-1" };

const RECORD_ROW: Row = {
  id: "r-1",
  household_id: "h-1",
  member_id: "m-1",
  label: "Blood test results",
  record_type: "lab_result",
  document_date: "2026-09-15",
  file_path: null,
  notes: null,
  privacy_scope: "private",
  status: "active",
  source_type: "manual_entry",
  provenance_id: "prov-1",
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

function fakeClient() {
  const provenanceInserts: Row[] = [];
  const recordInserts: Row[] = [];
  const recordUpdates: Row[] = [];
  let recordRow: Row = { ...RECORD_ROW };

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
      if (table === "health_records") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              order: async () => ({ data: [recordRow], error: null }),
              maybeSingle: async () => ({ data: recordRow, error: null }),
            };
            return chain;
          },
          insert: (row: Row) => {
            recordInserts.push(row);
            return { select: () => ({ single: async () => ({ data: { ...RECORD_ROW, ...row }, error: null }) }) };
          },
          update: (patch: Row) => {
            recordUpdates.push(patch);
            recordRow = { ...recordRow, ...patch };
            return {
              eq: () => ({
                eq: () => ({ select: () => ({ single: async () => ({ data: recordRow, error: null }) }) }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as never, provenanceInserts, recordInserts, recordUpdates };
}

describe("createRecord", () => {
  it("records provenance and defaults to manual_entry source", async () => {
    const { client, provenanceInserts, recordInserts } = fakeClient();
    await createRecord(client, ACTOR, { memberId: "m-1", label: "Blood test results", recordType: "lab_result", privacyScope: "private" });
    expect(provenanceInserts[0]).toMatchObject({ source_type: "manual_entry", confirmed_by: "m-1" });
    expect(recordInserts[0]).toMatchObject({ source_type: "manual_entry", created_by_member_id: "m-1" });
  });

  it("records home_send_document provenance when routed from HomeSend", async () => {
    const { client, provenanceInserts, recordInserts } = fakeClient();
    await createRecord(client, ACTOR, {
      memberId: "m-1",
      label: "Discharge summary",
      recordType: "discharge_summary",
      privacyScope: "private",
      sourceType: "home_send_document",
    });
    expect(provenanceInserts[0]).toMatchObject({ source_type: "home_send_document" });
    expect(recordInserts[0]).toMatchObject({ source_type: "home_send_document" });
  });
});

describe("updateRecord", () => {
  it("only patches the fields provided", async () => {
    const { client, recordUpdates } = fakeClient();
    await updateRecord(client, ACTOR, "r-1", { label: "Updated label" });
    expect(recordUpdates[0]).toEqual({ label: "Updated label" });
  });
});

describe("archiveRecord / reactivateRecord", () => {
  it("archives without touching the stored file", async () => {
    const { client, recordUpdates } = fakeClient();
    const result = await archiveRecord(client, ACTOR, "r-1");
    expect(result.status).toBe("archived");
    expect(recordUpdates[0]).toEqual({ status: "archived" });
  });

  it("brings an archived record back", async () => {
    const { client, recordUpdates } = fakeClient();
    const result = await reactivateRecord(client, ACTOR, "r-1");
    expect(result.status).toBe("active");
    expect(recordUpdates[0]).toEqual({ status: "active" });
  });
});
