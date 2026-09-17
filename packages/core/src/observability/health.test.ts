// lint-secrets: fixtures — the fake connection string below exists to prove a
// probe failure never echoes it back to the caller.
import { describe, expect, it } from "vitest";

import {
  checkHealth,
  runProbe,
  statusCodeFor,
  worstOf,
  SLOW_THRESHOLD_MS,
  type ComponentCheck,
} from "./health";

/** A clock that advances by a fixed amount between the two reads a probe makes. */
function clock(elapsed: number) {
  let calls = 0;
  return () => (calls++ === 0 ? 0 : elapsed);
}

const check = (status: ComponentCheck["status"]): ComponentCheck => ({
  name: "x",
  status,
  durationMs: 1,
});

describe("health probes", () => {
  it("reports a healthy dependency as ok", async () => {
    const result = await runProbe({ name: "database", run: async () => "fine" }, clock(5));
    expect(result).toMatchObject({ name: "database", status: "ok" });
  });

  it("treats a slow dependency as degraded rather than healthy", async () => {
    const result = await runProbe({ name: "database", run: async () => "slow" }, clock(SLOW_THRESHOLD_MS));
    expect(result.status).toBe("degraded");
  });

  it("reports a failing dependency as down without echoing the reason", async () => {
    const result = await runProbe({
      name: "database",
      run: async () => {
        throw new Error("connection to postgres://user:hunter2@db failed");
      },
    });

    expect(result.status).toBe("down");
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(result)).not.toContain("postgres");
  });

  it("does not hang when a probe never settles", async () => {
    const result = await runProbe({ name: "stuck", run: () => new Promise(() => {}) });
    expect(result.status).toBe("down");
  }, 10_000);

  it("takes the worst component status as the overall one", () => {
    expect(worstOf([check("ok"), check("ok")])).toBe("ok");
    expect(worstOf([check("ok"), check("degraded")])).toBe("degraded");
    expect(worstOf([check("degraded"), check("down")])).toBe("down");
    expect(worstOf([])).toBe("ok");
  });

  it("keeps serving while degraded and steps out only when down", () => {
    expect(statusCodeFor("ok")).toBe(200);
    expect(statusCodeFor("degraded")).toBe(200);
    expect(statusCodeFor("down")).toBe(503);
  });

  it("runs every probe even when one fails", async () => {
    const report = await checkHealth([
      { name: "a", run: async () => "ok" },
      {
        name: "b",
        run: async () => {
          throw new Error("no");
        },
      },
      { name: "c", run: async () => "ok" },
    ]);

    expect(report.checks.map((c) => c.name)).toEqual(["a", "b", "c"]);
    expect(report.status).toBe("down");
  });
});
