import { describe, expect, it } from "vitest";

import { platformCan, type PlatformAdmin } from "./admin";
import { listHouseholdFeatureFlags, setHouseholdFeatureFlag } from "./feature-flags";

const support: PlatformAdmin = { profileId: "p-1", role: "support" };
const operator: PlatformAdmin = { profileId: "p-2", role: "operator" };
const owner: PlatformAdmin = { profileId: "p-3", role: "owner" };

/** Throws if ever touched — proves a guard runs before any query. */
const untouchableClient = new Proxy(
  {},
  {
    get() {
      throw new Error("reached the database despite a guard that should have refused first");
    },
  },
) as never;

/** Minimal client covering the upsert-then-audit and the list paths. */
function fakeAdminClient() {
  const inserted: Record<string, unknown>[] = [];
  let flagRow: Record<string, unknown> | null = null;

  return {
    inserted,
    client: {
      from: (table: string) => {
        if (table === "household_feature_flags") {
          return {
            upsert: (row: Record<string, unknown>) => {
              flagRow = { id: "f-1", updated_at: "2026-09-21T00:00:00.000Z", ...row };
              return { select: () => ({ single: async () => ({ data: flagRow, error: null }) }) };
            },
            select: () => ({
              eq: () => ({
                order: async () => ({ data: flagRow ? [flagRow] : [], error: null }),
              }),
            }),
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

describe("feature_flags.manage", () => {
  it("is operator and owner only — support has no standing here", () => {
    expect(platformCan(support, "feature_flags.manage")).toBe(false);
    expect(platformCan(operator, "feature_flags.manage")).toBe(true);
    expect(platformCan(owner, "feature_flags.manage")).toBe(true);
  });

  it("refuses support before touching the database", async () => {
    await expect(
      setHouseholdFeatureFlag(untouchableClient, support, {
        householdId: "h-1",
        flagKey: "early_access_ai",
        enabled: true,
        reason: "Household opted into the beta program",
      }),
    ).rejects.toThrowError(/cannot manage/);

    await expect(listHouseholdFeatureFlags(untouchableClient, support, "h-1")).rejects.toThrowError(
      /cannot manage/,
    );
  });
});

describe("setting a household's flag", () => {
  it("refuses a flag key that is not the expected shape, before touching the database", async () => {
    await expect(
      setHouseholdFeatureFlag(untouchableClient, operator, {
        householdId: "h-1",
        flagKey: "Not A Valid Key!",
        enabled: true,
        reason: "Household opted into the beta program",
      }),
    ).rejects.toThrowError(/not a valid flag key/i);
  });

  it("refuses a reason nobody could review later, before touching the database", async () => {
    await expect(
      setHouseholdFeatureFlag(untouchableClient, operator, {
        householdId: "h-1",
        flagKey: "early_access_ai",
        enabled: true,
        reason: "beta",
      }),
    ).rejects.toThrowError(/reason someone reviewing this later/);
  });

  it("writes the flag and an audit event the household can read", async () => {
    const { client, inserted } = fakeAdminClient();

    const flag = await setHouseholdFeatureFlag(client, operator, {
      householdId: "h-1",
      flagKey: "early_access_ai",
      enabled: true,
      reason: "Household opted into the beta program for the new orchestrator",
    });

    expect(flag.flagKey).toBe("early_access_ai");
    expect(flag.enabled).toBe(true);
    expect(flag.householdId).toBe("h-1");

    expect(inserted).toHaveLength(1);
    const audit = inserted[0]!;
    expect(audit.table).toBe("audit_events");
    expect(audit.event_type).toBe("feature_flag.changed");
    expect(audit.household_id).toBe("h-1");
  });

  it("does not put the reason into the audit metadata", async () => {
    const { client, inserted } = fakeAdminClient();
    await setHouseholdFeatureFlag(client, operator, {
      householdId: "h-1",
      flagKey: "early_access_ai",
      enabled: true,
      reason: "Household opted into the beta program for the new orchestrator",
    });

    const audit = inserted[0]!;
    expect(JSON.stringify(audit.metadata)).not.toContain("opted into");
  });

  it("lists what was just set", async () => {
    const { client } = fakeAdminClient();
    await setHouseholdFeatureFlag(client, owner, {
      householdId: "h-1",
      flagKey: "early_access_ai",
      enabled: false,
      reason: "Rolled back after a household reported an issue",
    });

    const flags = await listHouseholdFeatureFlags(client, owner, "h-1");
    expect(flags).toHaveLength(1);
    expect(flags[0]!.enabled).toBe(false);
  });
});
