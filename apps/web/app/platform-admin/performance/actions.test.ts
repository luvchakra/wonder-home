import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: null as null | "support" | "operator" | "owner",
  password: "ok" as "ok" | "wrong" | "limited" | "unavailable",
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/admin-context", () => ({
  adminClientFor: () => ({ rpc: state.rpc }),
  adminGrant: { platformAdmin: () => ({}) },
}));
vi.mock("../../_lib/platform-staff", () => ({
  platformStaff: vi.fn(async (capability: string) => {
    const caps: Record<string, string[]> = {
      support: [],
      operator: ["performance.maintain"],
      owner: ["performance.maintain", "performance.reset"],
    };
    return state.role && caps[state.role].includes(capability) ? { profileId: "profile-1", role: state.role } : null;
  }),
}));
vi.mock("../../_lib/platform-step-up", () => ({ confirmStaffPassword: vi.fn(async () => state.password) }));

const { runPerformanceAction } = await import("./actions");

const IDLE = { tone: null, message: null } as const;
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

beforeEach(() => {
  state.role = "owner";
  state.password = "ok";
  state.rpc = vi.fn(async () => ({ data: { ok: true, tables: 1, count: 2 }, error: null }));
});

describe("Performance actions", () => {
  it("run nothing for anyone who is not staff with the right capability", async () => {
    state.role = null;
    expect(await runPerformanceAction(IDLE, form({ action: "analyze", target: "meals" }))).toMatchObject({ tone: "risk" });
    state.role = "support";
    expect(await runPerformanceAction(IDLE, form({ action: "analyze", target: "meals" }))).toMatchObject({ tone: "risk" });
    state.role = "operator";
    expect(await runPerformanceAction(IDLE, form({ action: "reset_statements", password: "x" }))).toMatchObject({ tone: "risk" });
    expect(await runPerformanceAction(IDLE, form({ action: "end_idle_sessions", minutes: "10", step: "run", password: "x" }))).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses an action that is not on the allowlist, and a malformed request", async () => {
    expect(await runPerformanceAction(IDLE, form({ action: "vacuum_full", target: "meals" }))).toMatchObject({ tone: "risk" });
    expect(await runPerformanceAction(IDLE, form({ action: "end_idle_sessions", minutes: "0", password: "x" }))).toMatchObject({ tone: "risk" });
    expect(await runPerformanceAction(IDLE, form({ action: "analyze", target: "x".repeat(64) }))).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("analyze needs no password and passes the staff id and table through the guarded function", async () => {
    const result = await runPerformanceAction(IDLE, form({ action: "analyze", target: "meals" }));
    expect(state.rpc).toHaveBeenCalledWith("platform_perf_analyze", { p_staff_profile_id: "profile-1", p_table: "meals" });
    expect(result).toMatchObject({ tone: "info", message: "Statistics refreshed for meals." });
  });

  it("a destructive action stops at a wrong password and never reaches the database", async () => {
    for (const password of ["wrong", "limited", "unavailable"] as const) {
      state.password = password;
      expect(await runPerformanceAction(IDLE, form({ action: "reset_statements", password: "nope" }))).toMatchObject({ tone: "risk" });
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("with the right password the reset runs", async () => {
    state.rpc = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const result = await runPerformanceAction(IDLE, form({ action: "reset_statements", password: "right" }));
    expect(state.rpc).toHaveBeenCalledWith("platform_perf_reset_statements", { p_staff_profile_id: "profile-1" });
    expect(result.tone).toBe("info");
  });

  it("ending connections previews first without a password, then needs one to run", async () => {
    const preview = await runPerformanceAction(IDLE, form({ action: "end_idle_sessions", minutes: "10", step: "preview" }));
    expect(state.rpc).toHaveBeenCalledWith("platform_perf_end_idle_sessions", { p_staff_profile_id: "profile-1", p_minutes: 10, p_dry_run: true });
    expect(preview).toMatchObject({ preview: 2, previewMinutes: 10 });

    state.password = "wrong";
    state.rpc.mockClear();
    await runPerformanceAction(IDLE, form({ action: "end_idle_sessions", minutes: "10", step: "run", password: "nope" }));
    expect(state.rpc).not.toHaveBeenCalled();

    state.password = "ok";
    const done = await runPerformanceAction(IDLE, form({ action: "end_idle_sessions", minutes: "10", step: "run", password: "right" }));
    expect(state.rpc).toHaveBeenCalledWith("platform_perf_end_idle_sessions", { p_staff_profile_id: "profile-1", p_minutes: 10, p_dry_run: false });
    expect(done.message).toBe("Ended 2 stuck connections. The app reconnects by itself.");
  });

  it("says the rate limit in words and never echoes database text", async () => {
    state.rpc = vi.fn(async () => ({ data: null, error: { message: "rate_limited: this action ran for this target less than a minute ago", code: "P0001" } }));
    expect((await runPerformanceAction(IDLE, form({ action: "analyze", target: "meals" }))).message).toBe("That ran less than a minute ago. Wait a minute and try again.");
    state.rpc = vi.fn(async () => ({ data: null, error: { message: 'relation "secret_table" does not exist', code: "42P01" } }));
    const result = await runPerformanceAction(IDLE, form({ action: "analyze", target: "meals" }));
    expect(result.message).not.toContain("secret_table");
    expect(result.tone).toBe("risk");
  });
});
