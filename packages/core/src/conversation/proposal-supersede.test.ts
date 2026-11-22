import { describe, expect, it } from "vitest";

import { supersededBy, supersedeOlderProposals, type SupersedeCandidate } from "./proposal-supersede";

const row = (id: string, over: Partial<SupersedeCandidate> = {}): SupersedeCandidate => ({ id, action_type: "adjust_schedule", outcome_key: "morning walk", payload: {}, ...over });

describe("supersededBy (owner, 2026-11-22)", () => {
  it("replaces the older move of the same thing (the live 5:50 → 5:20 case)", () => {
    expect(supersededBy(row("new"), [row("old")])).toEqual(["old"]);
  });

  it("matches the entity whatever its case or spacing", () => {
    expect(supersededBy(row("new", { outcome_key: "Morning Walk " }), [row("old")])).toEqual(["old"]);
  });

  it("leaves a different entity, a different action and itself alone", () => {
    expect(supersededBy(row("new"), [row("new"), row("a", { outcome_key: "school run" }), row("b", { action_type: "assign_responsibility" })])).toEqual([]);
  });

  it("never supersedes payments, orders or new entries", () => {
    for (const action_type of ["make_payment", "order_items", "plan_event"]) {
      expect(supersededBy(row("new", { action_type }), [row("old", { action_type })])).toEqual([]);
    }
  });

  it("never closes a child's request waiting on a grown-up, nor lets one close another", () => {
    expect(supersededBy(row("new"), [row("old", { payload: { referral: { approvalId: "x" } } })])).toEqual([]);
    expect(supersededBy(row("new", { payload: { referral: { approvalId: "x" } } }), [row("old")])).toEqual([]);
  });

  it("needs an entity to compare", () => {
    expect(supersededBy(row("new", { outcome_key: null }), [row("old", { outcome_key: null })])).toEqual([]);
  });
});

describe("supersedeOlderProposals", () => {
  it("closes the older as expired with reason superseded, never as done", async () => {
    const updates: { table: string; values: Record<string, unknown> }[] = [];
    const chain = (table: string, result: unknown) => {
      const query: Record<string, unknown> = {};
      for (const name of ["select", "eq", "neq", "in", "order", "limit"]) query[name] = () => query;
      query.update = (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return query;
      };
      query.maybeSingle = async () => ({ data: { id: "old" }, error: null });
      query.then = (resolve: (value: unknown) => void) => resolve(result);
      return query;
    };
    const admin = { from: (table: string) => chain(table, { data: [row("old")], error: null }) } as never;
    const closed = await supersedeOlderProposals(admin, { ...row("new"), household_id: "h", session_id: "s" }, new Date("2026-11-22T18:00:00Z"));
    expect(closed).toEqual(["old"]);
    const action = updates.find((update) => update.table === "conversation_actions");
    expect(action?.values).toMatchObject({ approval_status: "expired", result: { reason: "superseded", supersededBy: "new" } });
    expect(updates.some((update) => update.values.approval_status === "executed" || update.values.approval_status === "approved")).toBe(false);
  });

  it("does nothing for an action that is never superseded", async () => {
    const admin = { from: () => { throw new Error("not read"); } } as never;
    expect(await supersedeOlderProposals(admin, { ...row("new", { action_type: "make_payment" }), household_id: "h", session_id: "s" })).toEqual([]);
  });
});
