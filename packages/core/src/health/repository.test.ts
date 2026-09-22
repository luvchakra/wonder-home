import { describe, expect, it } from "vitest";

import {
  getHealthProfile,
  grantHealthConsent,
  listHealthConsents,
  revokeHealthConsent,
  setHealthProfile,
} from "./repository";

type Row = Record<string, unknown>;

const ACTOR = { householdId: "h-1", memberId: "m-1" };

const PROFILE_ROW: Row = {
  id: "p-1",
  household_id: "h-1",
  member_id: "m-1",
  privacy_scope: "private",
  ai_assistance_enabled: true,
  created_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

const CONSENT_ROW: Row = {
  id: "c-1",
  household_id: "h-1",
  subject_member_id: "m-1",
  viewer_member_id: "m-2",
  granted_by_member_id: "m-1",
  created_at: "2026-09-22T00:00:00.000Z",
};

function fakeClient() {
  const upserts: Row[] = [];
  const inserts: Row[] = [];
  const deletes: { table: string; filters: Row }[] = [];
  let errorCode: string | null = null;
  let profileRows: Row[] = [PROFILE_ROW];

  const client = {
    from: (table: string) => {
      if (table === "health_profiles") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              maybeSingle: async () => ({ data: profileRows[0] ?? null, error: null }),
            };
            return chain;
          },
          upsert: (row: Row) => {
            upserts.push(row);
            return {
              select: () => ({
                single: async () =>
                  errorCode
                    ? { data: null, error: { code: errorCode } }
                    : { data: { ...PROFILE_ROW, ...row }, error: null },
              }),
            };
          },
        };
      }
      if (table === "health_consents") {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              order: async () => ({ data: [CONSENT_ROW], error: null }),
            };
            return chain;
          },
          insert: (row: Row) => {
            inserts.push(row);
            return {
              select: () => ({
                single: async () =>
                  errorCode
                    ? { data: null, error: { code: errorCode } }
                    : { data: { ...CONSENT_ROW, ...row }, error: null },
              }),
            };
          },
          delete: () => ({
            eq: (columnA: string, valueA: string) => ({
              eq: async (columnB: string, valueB: string) => {
                deletes.push({ table, filters: { [columnA]: valueA, [columnB]: valueB } });
                return { error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return {
    client: client as never,
    upserts,
    inserts,
    deletes,
    setError: (code: string | null) => {
      errorCode = code;
    },
    setProfileRows: (rows: Row[]) => {
      profileRows = rows;
    },
  };
}

describe("getHealthProfile", () => {
  it("returns null when the member has no profile row yet", async () => {
    const { client, setProfileRows } = fakeClient();
    setProfileRows([]);
    expect(await getHealthProfile(client, "h-1", "m-1")).toBeNull();
  });

  it("maps an existing profile row", async () => {
    const { client } = fakeClient();
    const profile = await getHealthProfile(client, "h-1", "m-1");
    expect(profile).toEqual({
      id: "p-1",
      householdId: "h-1",
      memberId: "m-1",
      privacyScope: "private",
      aiAssistanceEnabled: true,
      createdByMemberId: "m-1",
      createdAt: "2026-09-22T00:00:00.000Z",
      updatedAt: "2026-09-22T00:00:00.000Z",
    });
  });
});

describe("setHealthProfile", () => {
  it("upserts only the fields given, stamping who made the change", async () => {
    const { client, upserts } = fakeClient();
    await setHealthProfile(client, ACTOR, { memberId: "m-1", privacyScope: "selected_family" });

    expect(upserts[0]).toEqual({
      household_id: "h-1",
      member_id: "m-1",
      created_by_member_id: "m-1",
      privacy_scope: "selected_family",
    });
  });

  it("translates an RLS refusal into a household-facing message", async () => {
    const { client, setError } = fakeClient();
    setError("42501");
    await expect(setHealthProfile(client, ACTOR, { memberId: "m-2" })).rejects.toThrowError(/own health settings/);
  });
});

describe("listHealthConsents", () => {
  it("lists a subject's granted consents", async () => {
    const { client } = fakeClient();
    const consents = await listHealthConsents(client, "h-1", "m-1");
    expect(consents).toEqual([
      {
        id: "c-1",
        householdId: "h-1",
        subjectMemberId: "m-1",
        viewerMemberId: "m-2",
        grantedByMemberId: "m-1",
        createdAt: "2026-09-22T00:00:00.000Z",
      },
    ]);
  });
});

describe("grantHealthConsent", () => {
  it("refuses to grant a person access to their own data", async () => {
    const { client } = fakeClient();
    await expect(
      grantHealthConsent(client, ACTOR, { subjectMemberId: "m-1", viewerMemberId: "m-1" }),
    ).rejects.toThrowError(/already have it/);
  });

  it("creates a consent row", async () => {
    const { client, inserts } = fakeClient();
    const consent = await grantHealthConsent(client, ACTOR, { subjectMemberId: "m-1", viewerMemberId: "m-2" });
    expect(inserts[0]).toEqual({
      household_id: "h-1",
      subject_member_id: "m-1",
      viewer_member_id: "m-2",
      granted_by_member_id: "m-1",
    });
    expect(consent.viewerMemberId).toBe("m-2");
  });

  it("translates an RLS refusal into a household-facing message", async () => {
    const { client, setError } = fakeClient();
    setError("42501");
    await expect(
      grantHealthConsent(client, ACTOR, { subjectMemberId: "m-3", viewerMemberId: "m-2" }),
    ).rejects.toThrowError(/their guardian/);
  });

  it("translates a duplicate grant into a household-facing message", async () => {
    const { client, setError } = fakeClient();
    setError("23505");
    await expect(
      grantHealthConsent(client, ACTOR, { subjectMemberId: "m-1", viewerMemberId: "m-2" }),
    ).rejects.toThrowError(/already has access/);
  });
});

describe("revokeHealthConsent", () => {
  it("deletes the named consent, scoped to the household", async () => {
    const { client, deletes } = fakeClient();
    await revokeHealthConsent(client, ACTOR, "c-1");
    expect(deletes).toEqual([{ table: "health_consents", filters: { household_id: "h-1", id: "c-1" } }]);
  });
});
