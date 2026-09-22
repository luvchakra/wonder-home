import { describe, expect, it, vi } from "vitest";

import {
  MAX_SUPPORT_HOURS,
  clampHours,
  grantSupportAccess,
  platformCan,
  type PlatformAdmin,
} from "./admin";

const support: PlatformAdmin = { profileId: "p-1", role: "support" };
const operator: PlatformAdmin = { profileId: "p-2", role: "operator" };
const owner: PlatformAdmin = { profileId: "p-3", role: "owner" };

/** Minimal client covering the insert-and-audit path. */
function fakeAdminClient() {
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    client: {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push({ table, ...row });
          return {
            select: () => ({ single: async () => ({ data: { id: "g-1" }, error: null }) }),
          };
        },
      }),
    } as never,
  };
}

describe("platform roles", () => {
  it("does not let support grant itself household access", () => {
    expect(platformCan(support, "support_access.grant")).toBe(false);
    expect(platformCan(operator, "support_access.grant")).toBe(true);
  });

  it("reserves managing staff for the owner role", () => {
    expect(platformCan(owner, "platform_admin.manage")).toBe(true);
    expect(platformCan(operator, "platform_admin.manage")).toBe(false);
    expect(platformCan(support, "platform_admin.manage")).toBe(false);
  });

  it("reserves managing privacy requests for operator and owner", () => {
    expect(platformCan(owner, "privacy_requests.manage")).toBe(true);
    expect(platformCan(operator, "privacy_requests.manage")).toBe(true);
    expect(platformCan(support, "privacy_requests.manage")).toBe(false);
  });
});

describe("support grants", () => {
  it("refuses a role that cannot grant access", async () => {
    const { client } = fakeAdminClient();
    await expect(
      grantSupportAccess(client, support, {
        householdId: "h-1",
        reasonCode: "user_reported_issue",
        reasonNote: "Routines stopped running for this household",
      }),
    ).rejects.toThrowError(/cannot grant household access/);
  });

  it("refuses a reason nobody could review later", async () => {
    const { client } = fakeAdminClient();
    await expect(
      grantSupportAccess(client, operator, {
        householdId: "h-1",
        reasonCode: "data_correction",
        reasonNote: "fixing",
      }),
    ).rejects.toThrowError(/reason someone reviewing this later/);
  });

  it("records the grant and an audit event the household can read", async () => {
    const { client, inserted } = fakeAdminClient();

    const result = await grantSupportAccess(client, operator, {
      householdId: "h-1",
      reasonCode: "user_reported_issue",
      reasonNote: "Household reported that routines stopped running",
    });

    expect(result.grantId).toBe("g-1");
    expect(inserted.map((row) => row.table)).toEqual([
      "support_access_grants",
      "audit_events",
    ]);

    const audit = inserted[1]!;
    expect(audit.event_type).toBe("support.access_granted");
    expect(audit.household_id).toBe("h-1");
  });

  it("never issues an unbounded grant", () => {
    expect(clampHours(999)).toBe(MAX_SUPPORT_HOURS);
    expect(clampHours(0)).toBe(1);
    expect(clampHours(-5)).toBe(1);
    expect(clampHours(Number.NaN)).toBe(2);
    expect(clampHours(4.7)).toBe(4);
  });

  it("defaults to a short window rather than the maximum", async () => {
    const { client } = fakeAdminClient();
    const result = await grantSupportAccess(client, owner, {
      householdId: "h-1",
      reasonCode: "billing_dispute",
      reasonNote: "Customer disputes a charge on their account",
    });

    expect(result.hours).toBe(2);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not put the reason note into the audit metadata", async () => {
    const { client, inserted } = fakeAdminClient();
    await grantSupportAccess(client, operator, {
      householdId: "h-1",
      reasonCode: "security_investigation",
      reasonNote: "Investigating a report involving a named member of the family",
    });

    // The note lives on the grant, which the household can read. Copying it into
    // audit metadata would duplicate free text into a second place.
    const audit = inserted[1]!;
    expect(JSON.stringify(audit.metadata)).not.toContain("named member");
  });
});
