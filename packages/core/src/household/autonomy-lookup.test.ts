import { afterEach, describe, expect, it } from "vitest";

import { setLogSink, type LogRecord } from "../observability/logger";
import { lookupAutonomy, parseAutonomyMode } from "./autonomy-lookup";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";

type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };

/** A stand-in for the admin client's rpc, recording what it was asked. */
function rpcReturning(response: RpcResponse | (() => Promise<RpcResponse>) | "throw") {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (response === "throw") throw new Error("socket hang up");
      return typeof response === "function" ? response() : Promise.resolve(response);
    },
  } as unknown as Parameters<typeof lookupAutonomy>[0];
  return { client, calls };
}

const logs: LogRecord[] = [];
setLogSink((record) => logs.push(record));
afterEach(() => {
  logs.length = 0;
});

describe("reading a household's autonomy (fail closed)", () => {
  it.each(["prepare", "execute"] as const)("A: a configured %s resolves to %s", async (mode) => {
    const { client, calls } = rpcReturning({ data: mode, error: null });
    const result = await lookupAutonomy(client, HOUSEHOLD, "groceries.stocked");
    expect(result).toEqual({ mode, success: true, errorCategory: null });
    // The one wrapper, with the household and outcome it was asked about.
    expect(calls).toEqual([{ fn: "autonomy_for", args: { p_household_id: HOUSEHOLD, p_outcome_key: "groceries.stocked" } }]);
  });

  it.each(["observe", "approve"])("A2: an old %s left in a database fails closed to prepare (migration 20261026090000)", async (old) => {
    expect(await lookupAutonomy(rpcReturning({ data: old, error: null }).client, HOUSEHOLD, "groceries.stocked")).toEqual({ mode: "prepare", success: false, errorCategory: "invalid_value" });
  });

  it("B1: a missing wrapper (404 / PGRST202) is prepare", async () => {
    const { client } = rpcReturning({ data: null, error: { code: "PGRST202", message: "Could not find the function public.autonomy_for" } });
    expect(await lookupAutonomy(client, HOUSEHOLD, "groceries.stocked")).toEqual({ mode: "prepare", success: false, errorCategory: "rpc_error" });
  });

  it("B2: a database error is prepare", async () => {
    const { client } = rpcReturning({ data: null, error: { code: "42501", message: "permission denied for function autonomy_for" } });
    expect((await lookupAutonomy(client, HOUSEHOLD, "groceries.stocked")).mode).toBe("prepare");
  });

  it("B3: null or undefined is prepare", async () => {
    expect((await lookupAutonomy(rpcReturning({ data: null, error: null }).client, HOUSEHOLD, "x.y")).mode).toBe("prepare");
    expect((await lookupAutonomy(rpcReturning({ data: undefined, error: null }).client, HOUSEHOLD, "x.y")).mode).toBe("prepare");
  });

  it("B4: an invalid string or a wrong type is prepare — never a near-miss for execute", async () => {
    for (const data of ["EXECUTE", "execute ", "auto", "", 1, true, ["execute"], { mode: "execute" }]) {
      const result = await lookupAutonomy(rpcReturning({ data, error: null }).client, HOUSEHOLD, "groceries.stocked");
      expect(result).toEqual({ mode: "prepare", success: false, errorCategory: "invalid_value" });
    }
  });

  it("B5: a lookup that does not answer in time is prepare", async () => {
    const never = () => new Promise<RpcResponse>(() => {});
    const result = await lookupAutonomy(rpcReturning(never).client, HOUSEHOLD, "groceries.stocked", { timeoutMs: 10 });
    expect(result).toEqual({ mode: "prepare", success: false, errorCategory: "timeout" });
  });

  it("a client that throws is prepare", async () => {
    expect(await lookupAutonomy(rpcReturning("throw").client, HOUSEHOLD, "groceries.stocked")).toEqual({ mode: "prepare", success: false, errorCategory: "thrown" });
  });

  it("logs what was resolved and whether the lookup worked — the household, the outcome and the mode, nothing else", async () => {
    await lookupAutonomy(rpcReturning({ data: "execute", error: null }).client, HOUSEHOLD, "groceries.stocked");
    await lookupAutonomy(rpcReturning({ data: null, error: { code: "PGRST202" } }).client, HOUSEHOLD, "groceries.stocked");
    expect(logs.map((record) => [record.level, record.resolved_autonomy, record.lookup_success, record.lookup_error_category])).toEqual([
      ["info", "execute", true, null],
      ["warn", "prepare", false, "rpc_error"],
    ]);
    expect(logs[0]).toMatchObject({ household_id: HOUSEHOLD, outcome_key: "groceries.stocked" });
  });

  it("parses only the two known modes; an old observe or approve is not one", () => {
    expect(["prepare", "execute", "observe", "approve"].map(parseAutonomyMode)).toEqual(["prepare", "execute", null, null]);
    expect([null, undefined, "Execute", 3].map(parseAutonomyMode)).toEqual([null, null, null, null]);
  });
});
