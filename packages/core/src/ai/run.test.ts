import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlannedStep } from "./orchestrator";

/**
 * The whole agent pipeline for one run (`runHouseholdAgents`), with the
 * database, the planner and the executors stood in for — so what is under
 * test is exactly the order of gates the real run applies: entitlement,
 * then per step tool authorization (scope → permission → autonomy), then
 * the executor, whose own result decides whether anything is "done".
 */

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  entitled: true,
  autonomy: { data: "execute" as unknown, error: null as null | { code: string } },
  rpcCalls: [] as { fn: string; args: unknown }[],
  steps: [] as PlannedStep[],
  toolCalls: [] as Record<string, unknown>[],
  runUpdates: [] as Record<string, unknown>[],
  notifications: 0,
  /** A run already going for this household, for the one-run lock (Wave 5 §17). */
  running: null as { id: string } | null,
}));

const executor = vi.hoisted(() => ({
  run: vi.fn(async (..._args: unknown[]): Promise<{ performed: true; detail: string } | { performed: false; reason: string }> => ({ performed: true, detail: "Added milk to the groceries." })),
}));

vi.mock("../billing/repository", () => ({
  may: async () => (state.entitled ? { allowed: true, remaining: null, reason: "ok" } : { allowed: false, code: "not_in_plan", reason: "Agent runs are not part of this household's plan." }),
}));

vi.mock("../db/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      return state.autonomy;
    },
    from: (table: string) => ({
      select: () => {
        const chain = { eq: () => chain, gte: () => chain, limit: () => chain, maybeSingle: async () => ({ data: state.running, error: null }) };
        return chain;
      },
      insert: (row: Record<string, unknown>) => {
        if (table === "agent_tool_calls") state.toolCalls.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }), then: (resolve: (v: unknown) => unknown) => resolve({ error: null }) };
      },
      update: (row: Record<string, unknown>) => {
        state.runUpdates.push(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

vi.mock("./gather-assessments", () => ({ householdAssessments: async () => [] }));
vi.mock("./specialists", () => ({ coordinate: () => ({ steps: state.steps, contracts: [] }) }));
vi.mock("./executors", () => ({ runExecutor: executor.run }));
vi.mock("../notifications/create", () => ({
  createNotification: async () => {
    state.notifications += 1;
  },
}));

const { runHouseholdAgents } = await import("./run");

const ADMIN = { memberId: "m-admin", roles: ["administrator" as const] };
const ADULT = { memberId: "m-adult", roles: ["adult" as const] };
const addMilk: PlannedStep = { toolName: "list.add_item", rationale: "Milk is running low.", arguments: { name: "milk", quantity: 1, unit: "litre", outcomeKey: "groceries.stocked" } };

beforeEach(() => {
  state.entitled = true;
  state.autonomy = { data: "execute", error: null };
  state.rpcCalls = [];
  state.steps = [addMilk];
  state.toolCalls = [];
  state.runUpdates = [];
  state.notifications = 0;
  state.running = null;
  executor.run.mockClear();
  executor.run.mockImplementation(async () => ({ performed: true, detail: "Added milk to the groceries." }));
});

describe("the agent pipeline, gate by gate", () => {
  it("reads autonomy for the step's own outcome, through the server-only wrapper, for this household", async () => {
    await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(state.rpcCalls).toEqual([{ fn: "autonomy_for", args: { p_household_id: HOUSEHOLD, p_outcome_key: "groceries.stocked" } }]);
  });

  it("D4: execute, and every gate passes — the governed executor is called and the run reports it handled", async () => {
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(executor.run).toHaveBeenCalledTimes(1);
    expect(executor.run.mock.calls[0]?.[2]).toEqual(addMilk);
    expect(summary).toMatchObject({ executed: 1, awaitingApproval: 0, refused: 0 });
    expect(state.toolCalls).toEqual([expect.objectContaining({ tool_name: "list.add_item", outcome: "executed" })]);
  });

  it("observe — nothing is written: the step is refused before any executor runs", async () => {
    state.autonomy = { data: "observe", error: null };
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(executor.run).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ executed: 0, refused: 1 });
    expect(state.toolCalls).toEqual([expect.objectContaining({ outcome: "refused", refusal_code: "autonomy_forbids" })]);
  });

  it.each(["prepare", "approve"] as const)("%s — the step waits for a person; no executor runs before approval", async (mode) => {
    state.autonomy = { data: mode, error: null };
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(executor.run).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ executed: 0, awaitingApproval: 1 });
    expect(state.toolCalls).toEqual([expect.objectContaining({ outcome: "awaiting_approval" })]);
  });

  it("a failed autonomy lookup fails closed: nothing executes", async () => {
    state.autonomy = { data: null, error: { code: "PGRST202" } };
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(executor.run).not.toHaveBeenCalled();
    expect(summary.executed).toBe(0);
  });

  it("D1: execute, but agent runs are not in the household's plan — nothing runs at all", async () => {
    state.entitled = false;
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(executor.run).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([]);
    expect(summary).toMatchObject({ runId: null, executed: 0 });
  });

  it("D2: execute, but the member lacks the permission the tool requires — refused before autonomy matters", async () => {
    state.steps = [{ toolName: "home.book_service", rationale: "The geyser is due a service.", arguments: { outcomeKey: "home.maintenance" } }];
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADULT);
    expect(executor.run).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ executed: 0, refused: 1 });
    expect(state.toolCalls).toEqual([expect.objectContaining({ refusal_code: "missing_permission" })]);
  });

  it("D3: execute, but tool authorization fails — an unknown tool is refused", async () => {
    state.steps = [{ toolName: "database.write_anything", rationale: "The model asked for it.", arguments: {} }];
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(executor.run).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ executed: 0, refused: 1 });
    expect(state.toolCalls).toEqual([expect.objectContaining({ refusal_code: "unknown_tool" })]);
  });

  it("D3: a payment is never executed on autonomy alone, even at execute", async () => {
    state.steps = [{ toolName: "bills.pay", rationale: "The electricity bill is due.", arguments: { billId: "b-1" } }];
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(executor.run).not.toHaveBeenCalled();
    expect(summary.awaitingApproval).toBe(1);
  });

  it("D5: the executor fails — the run does not claim it was done", async () => {
    executor.run.mockImplementation(async () => ({ performed: false, reason: "The groceries list could not be updated." }));
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(summary).toMatchObject({ executed: 0, refused: 1 });
    expect(summary.headline).not.toMatch(/handled/);
    expect(state.toolCalls).toEqual([expect.objectContaining({ outcome: "refused", reason: "The groceries list could not be updated." })]);
  });

  it("D5: an executor that throws is refused too, and the run still finishes rather than being left running", async () => {
    executor.run.mockImplementation(async () => {
      throw new Error("insert failed");
    });
    const summary = await runHouseholdAgents({} as never, HOUSEHOLD, ADMIN);
    expect(summary).toMatchObject({ executed: 0, refused: 1 });
    expect(state.runUpdates.at(-1)).toMatchObject({ status: expect.not.stringMatching(/^running$/) });
  });
});

describe("one run at a time (Wave 5 §17)", () => {
  it("a second check while one is still going returns that run and plans nothing twice", async () => {
    state.running = { id: "run-already" };
    const summary = await runHouseholdAgents({} as never, "h-1", ADMIN);
    expect(summary.runId).toBe("run-already");
    expect(summary.headline).toMatch(/already checking/);
    expect(executor.run).not.toHaveBeenCalled();
    expect(state.toolCalls).toEqual([]);
  });
});
