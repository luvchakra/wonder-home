import { describe, expect, it } from "vitest";

import { fulfillMaturedDeletions } from "./fulfill-deletion";

const MATURED_ROW = { id: "r-1", household_id: "h-1", subject_member_id: "m-1" };

type FakeOptions = {
  requests?: Record<string, unknown>[];
  memberRow?: Record<string, unknown> | null;
  throwOnMemberUpdate?: boolean;
};

/** A fake admin client covering the lookup, scrub, role-drop, completion and audit paths. */
function fakeAdminClient(options: FakeOptions = {}) {
  const { requests = [MATURED_ROW], memberRow = { avatar_path: "h-1/m-1/photo.jpg" } } = options;

  const memberUpdates: Record<string, unknown>[] = [];
  const requestUpdates: Record<string, unknown>[] = [];
  const rolesDeletedFor: string[] = [];
  const storageRemoved: string[][] = [];
  const audited: Record<string, unknown>[] = [];

  const client = {
    from: (table: string) => {
      if (table === "privacy_requests") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                lte: async () => ({ data: requests, error: null }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            requestUpdates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "household_members") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: memberRow, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            memberUpdates.push(patch);
            return {
              eq: () => ({
                eq: async () =>
                  options.throwOnMemberUpdate ? { error: { code: "boom" } } : { error: null },
              }),
            };
          },
        };
      }
      if (table === "household_roles") {
        return {
          delete: () => ({
            eq: () => ({
              eq: (_column: string, value: string) => {
                void _column;
                rolesDeletedFor.push(value);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "audit_events") {
        return {
          insert: (row: Record<string, unknown>) => {
            audited.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          storageRemoved.push(paths);
          return { data: null, error: null };
        },
      }),
    },
  };

  return { client: client as never, memberUpdates, requestUpdates, rolesDeletedFor, storageRemoved, audited };
}

describe("fulfillMaturedDeletions", () => {
  it("scrubs the member's PII, keeps the row, and completes the request", async () => {
    const { client, memberUpdates, requestUpdates } = fakeAdminClient();

    const outcomes = await fulfillMaturedDeletions(client, new Date("2026-10-05T00:00:00.000Z"));

    expect(outcomes).toEqual([{ requestId: "r-1", householdId: "h-1", subjectMemberId: "m-1", fulfilled: true }]);

    const patch = memberUpdates[0]!;
    expect(patch.display_name).toBe("Removed member");
    expect(patch.date_of_birth).toBeNull();
    expect(patch.nickname).toBeNull();
    expect(patch.avatar_path).toBeNull();
    expect(patch.profile_id).toBeNull();
    expect(patch.status).toBe("inactive");

    expect(requestUpdates[0]).toEqual({ status: "completed", completed_at: "2026-10-05T00:00:00.000Z" });
  });

  it("deletes the avatar photo from storage when one exists", async () => {
    const { client, storageRemoved } = fakeAdminClient({ memberRow: { avatar_path: "h-1/m-1/photo.jpg" } });
    await fulfillMaturedDeletions(client);
    expect(storageRemoved).toEqual([["h-1/m-1/photo.jpg"]]);
  });

  it("skips storage removal when there is no avatar", async () => {
    const { client, storageRemoved } = fakeAdminClient({ memberRow: { avatar_path: null } });
    await fulfillMaturedDeletions(client);
    expect(storageRemoved).toEqual([]);
  });

  it("drops the member's household roles, same as any other removal", async () => {
    const { client, rolesDeletedFor } = fakeAdminClient();
    await fulfillMaturedDeletions(client);
    expect(rolesDeletedFor).toEqual(["m-1"]);
  });

  it("writes an audit event naming the request it fulfilled", async () => {
    const { client, audited } = fakeAdminClient();
    await fulfillMaturedDeletions(client);
    expect(audited).toHaveLength(1);
    expect(audited[0]!.event_type).toBe("privacy.deletion_fulfilled");
    expect(audited[0]!.target_id).toBe("m-1");
  });

  it("reports nothing to do when no request has matured", async () => {
    const { client } = fakeAdminClient({ requests: [] });
    const outcomes = await fulfillMaturedDeletions(client);
    expect(outcomes).toEqual([]);
  });

  it("reports a per-request failure without throwing, so one bad row does not stop the others", async () => {
    const { client } = fakeAdminClient({ throwOnMemberUpdate: true });
    const outcomes = await fulfillMaturedDeletions(client);
    expect(outcomes).toEqual([
      { requestId: "r-1", householdId: "h-1", subjectMemberId: "m-1", fulfilled: false, error: expect.any(String) },
    ]);
  });

  it("closes a request with no subject left to scrub, rather than retrying it forever", async () => {
    const { client, requestUpdates } = fakeAdminClient({
      requests: [{ id: "r-2", household_id: "h-2", subject_member_id: null }],
    });
    const outcomes = await fulfillMaturedDeletions(client, new Date("2026-10-05T00:00:00.000Z"));
    expect(outcomes).toEqual([{ requestId: "r-2", householdId: "h-2", subjectMemberId: null, fulfilled: true }]);
    expect(requestUpdates[0]).toEqual({ status: "completed", completed_at: "2026-10-05T00:00:00.000Z" });
  });
});
