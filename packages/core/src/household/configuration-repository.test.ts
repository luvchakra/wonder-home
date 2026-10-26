import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { ConfigMember } from "./configuration";
import { setAutonomyForOutcomes } from "./configuration-repository";

vi.mock("../api/audit", () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock("../db/admin", () => ({ createAdminClient: () => ({}) }));

const MEMBERS: ConfigMember[] = [
  { id: "11111111-1111-4111-8111-111111111111", displayName: "Asha", memberType: "adult" },
  { id: "22222222-2222-4222-8222-222222222222", displayName: "Ravi", memberType: "adult" },
];

/** The stored responsibilities, as the table returns them (snake case). */
const STORED = [
  { outcome_key: "laundry.ready", primary_member_id: MEMBERS[0]!.id, backup_member_id: MEMBERS[1]!.id, ai_mode: "prepare", priority: 1 },
  { outcome_key: "home.cleaning", primary_member_id: MEMBERS[1]!.id, backup_member_id: null, ai_mode: "prepare", priority: 2 },
  { outcome_key: "meals.dinner_ready", primary_member_id: null, backup_member_id: null, ai_mode: "prepare", priority: 3 },
];

/**
 * A database stand-in for the two calls the write makes: the list of
 * responsibilities, and an upsert per row. Every upsert is recorded.
 */
function fakeSupabase() {
  const upserts: Array<Record<string, unknown>> = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: STORED, error: null }) }) }),
      upsert: (values: Record<string, unknown>) => {
        upserts.push(values);
        return { select: () => ({ single: async () => ({ data: { id: `id-${String(values.outcome_key)}` }, error: null }) }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, upserts };
}

const HOUSEHOLD = "33333333-3333-4333-8333-333333333333";
const ACTOR = "44444444-4444-4444-8444-444444444444";

describe("setAutonomyForOutcomes", () => {
  it("sets the chosen mode on the listed responsibilities and nothing else", async () => {
    const { client, upserts } = fakeSupabase();
    const changed = await setAutonomyForOutcomes(client, {
      householdId: HOUSEHOLD,
      actorMemberId: ACTOR,
      members: MEMBERS,
      outcomeKeys: ["laundry.ready", "home.cleaning"],
      aiMode: "execute",
    });

    expect(changed).toBe(2);
    expect(upserts.map((values) => values.outcome_key)).toEqual(["laundry.ready", "home.cleaning"]);
    expect(upserts.every((values) => values.ai_mode === "execute")).toBe(true);
    expect(upserts.every((values) => values.household_id === HOUSEHOLD)).toBe(true);
  });

  it("refuses a group that includes an unowned outcome for a mode that acts alone, and writes none of it", async () => {
    const { client, upserts } = fakeSupabase();
    // laundry.ready is owned and would be fine on its own; meals.dinner_ready has no owner.
    await expect(
      setAutonomyForOutcomes(client, { householdId: HOUSEHOLD, actorMemberId: ACTOR, members: MEMBERS, outcomeKeys: ["laundry.ready", "meals.dinner_ready"], aiMode: "execute" }),
    ).rejects.toThrow(/meals\.dinner_ready/);

    expect(upserts).toEqual([]);
  });

  it("lets an unowned outcome wait for a person, since it does not act on its own", async () => {
    const { client, upserts } = fakeSupabase();
    const changed = await setAutonomyForOutcomes(client, { householdId: HOUSEHOLD, actorMemberId: ACTOR, members: MEMBERS, outcomeKeys: ["meals.dinner_ready"], aiMode: "prepare" });

    expect(changed).toBe(1);
    expect(upserts.map((values) => values.ai_mode)).toEqual(["prepare"]);
  });

  it("keeps each responsibility's owner, backup and priority as they were", async () => {
    const { client, upserts } = fakeSupabase();
    await setAutonomyForOutcomes(client, { householdId: HOUSEHOLD, actorMemberId: ACTOR, members: MEMBERS, outcomeKeys: ["laundry.ready"], aiMode: "prepare" });

    expect(upserts).toEqual([
      {
        household_id: HOUSEHOLD,
        outcome_key: "laundry.ready",
        primary_member_id: MEMBERS[0]!.id,
        backup_member_id: MEMBERS[1]!.id,
        ai_mode: "prepare",
        priority: 1,
      },
    ]);
  });

  it("writes nothing and reports zero when none of the keys is a responsibility", async () => {
    const { client, upserts } = fakeSupabase();
    const changed = await setAutonomyForOutcomes(client, { householdId: HOUSEHOLD, actorMemberId: ACTOR, members: MEMBERS, outcomeKeys: ["pets.walk"], aiMode: "prepare" });

    expect(changed).toBe(0);
    expect(upserts).toEqual([]);
  });
});
