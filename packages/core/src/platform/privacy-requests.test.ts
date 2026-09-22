import { describe, expect, it } from "vitest";

import { type PlatformAdmin } from "./admin";
import { listPlatformPrivacyRequests, refusePrivacyRequest } from "./privacy-requests";

const support: PlatformAdmin = { profileId: "p-1", role: "support" };
const operator: PlatformAdmin = { profileId: "p-2", role: "operator" };
const owner: PlatformAdmin = { profileId: "p-3", role: "owner" };

/** Throws if ever touched — proves a guard runs before any query. */
const untouchableClient = new Proxy(
  {},
  {
    get() {
      throw new Error("reached the database despite a role that should have been refused");
    },
  },
) as never;

const REQUEST_ROW = {
  id: "r-1",
  household_id: "h-1",
  kind: "deletion",
  status: "pending",
  subject_member_id: "m-1",
  requested_by_member_id: "m-1",
  acts_at: "2026-10-01T00:00:00.000Z",
  completed_at: null,
  refusal_reason: null,
  created_at: "2026-09-01T00:00:00.000Z",
};

/** Minimal client covering the list and the refuse-then-audit paths. */
function fakeAdminClient() {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  let matched = true;

  return {
    inserted,
    updated,
    setMatch: (value: boolean) => {
      matched = value;
    },
    client: {
      from: (table: string) => {
        if (table === "privacy_requests") {
          return {
            select: () => {
              const chain: Record<string, unknown> = {
                eq: () => chain,
                order: () => chain,
                limit: () => chain,
                then: (resolve: (value: { data: unknown; error: null }) => void) =>
                  resolve({ data: matched ? [REQUEST_ROW] : [], error: null }),
              };
              return chain;
            },
            update: (patch: Record<string, unknown>) => {
              updated.push(patch);
              return {
                eq: () => ({
                  in: () => ({
                    select: () => ({
                      maybeSingle: async () =>
                        matched ? { data: { id: "r-1", household_id: "h-1" }, error: null } : { data: null, error: null },
                    }),
                  }),
                }),
              };
            },
          };
        }
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push({ table, ...row });
            return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) };
          },
        };
      },
    } as never,
  };
}

describe("privacy_requests.manage", () => {
  it("refuses support before touching the database", async () => {
    await expect(listPlatformPrivacyRequests(untouchableClient, support)).rejects.toThrowError(/cannot manage/);
    await expect(
      refusePrivacyRequest(untouchableClient, support, { requestId: "r-1", reason: "A legal hold applies here" }),
    ).rejects.toThrowError(/cannot manage/);
  });
});

describe("listPlatformPrivacyRequests", () => {
  it("lists requests for operator and owner", async () => {
    const { client } = fakeAdminClient();
    const requests = await listPlatformPrivacyRequests(client, operator);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.id).toBe("r-1");
    expect(requests[0]!.kind).toBe("deletion");
    expect(requests[0]!.status).toBe("pending");
  });
});

describe("refusePrivacyRequest", () => {
  it("refuses a reason nobody could review later, before touching the database", async () => {
    await expect(
      refusePrivacyRequest(untouchableClient, owner, { requestId: "r-1", reason: "no" }),
    ).rejects.toThrowError(/reason someone reviewing this later/);
  });

  it("writes the refusal and an audit event", async () => {
    const { client, updated, inserted } = fakeAdminClient();

    await refusePrivacyRequest(client, operator, { requestId: "r-1", reason: "Under an active legal hold" });

    expect(updated[0]).toEqual({ status: "refused", refusal_reason: "Under an active legal hold" });
    expect(inserted).toHaveLength(1);
    const audit = inserted[0]!;
    expect(audit.table).toBe("audit_events");
    expect(audit.event_type).toBe("privacy.request_refused");
    expect(audit.household_id).toBe("h-1");
  });

  it("refuses when there is no pending or ready request with that id", async () => {
    const { client, setMatch } = fakeAdminClient();
    setMatch(false);

    await expect(
      refusePrivacyRequest(client, owner, { requestId: "missing", reason: "Does not exist, testing the 404" }),
    ).rejects.toThrowError(/no pending or ready request/);
  });
});
