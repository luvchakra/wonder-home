import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Move all from Vercel": the owner alone, with a password; never a bootstrap
 * key; never a value in the answer or the log; twice moves nothing; a
 * read-back that doesn't match Vercel is said so.
 */

const state = vi.hoisted(() => ({
  staff: null as null | { profileId: string; role: "support" | "operator" | "owner" },
  password: "ok" as "ok" | "wrong" | "limited" | "unavailable",
  rows: new Map<string, { key: string; secret: boolean; value: string | null; value_last4: string | null; updated_at: string | null; updated_by: string | null }>(),
  /** Simulates a store that saves a different value than it was sent. */
  corrupt: null as string | null,
  rpc: vi.fn(),
  logs: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("@wonderhome/core/observability/logger", () => {
  const record = (...args: unknown[]) => state.logs.push(args);
  return { log: { info: record, warn: record, error: record, debug: record } };
});
vi.mock("../_lib/platform-staff", () => ({
  platformStaff: vi.fn(async (capability: string) => {
    if (!state.staff) return null;
    const { platformCan } = await import("@wonderhome/core/platform/admin");
    return platformCan(state.staff, capability) ? state.staff : null;
  }),
}));
vi.mock("../_lib/platform-step-up", () => ({ confirmStaffPassword: vi.fn(async () => state.password) }));

const { moveAllFromVercelAction } = await import("./settings-actions");

const IDLE = { tone: null, message: null, report: null };
const SECRET = "sk-test-WonderHomeOwnKey-abcdefgh9876";
const MAPS = "AIzaSyExampleExampleExample4321";
const BOOTSTRAP_VALUE = "service-role-key-should-never-move-0000";

function form(password = "pw") {
  const data = new FormData();
  data.set("password", password);
  return data;
}

function fakeRpc() {
  return vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === "platform_config_status") return { data: [...state.rows.values()], error: null };
    if (name === "platform_config_import") {
      const items = args.p_items as { key: string; value: string; secret: boolean }[];
      const out = items.map((item) => {
        if (state.rows.has(item.key)) return { key: item.key, status: "already" };
        const value = state.corrupt === item.key ? `${item.value}x` : item.value;
        state.rows.set(item.key, {
          key: item.key,
          secret: item.secret,
          value: item.secret ? null : value,
          value_last4: item.secret ? (value.length >= 12 ? value.slice(-4) : null) : null,
          updated_at: "2026-11-07T12:00:00Z",
          updated_by: String(args.p_actor),
        });
        return { key: item.key, status: "moved" };
      });
      return { data: { items: out }, error: null };
    }
    return { data: null, error: null };
  });
}

beforeEach(() => {
  state.staff = null;
  state.password = "ok";
  state.rows = new Map();
  state.corrupt = null;
  state.logs = [];
  state.rpc = fakeRpc();
  vi.unstubAllEnvs();
  vi.stubEnv("WONDERHOME_AI_KEY", SECRET);
  vi.stubEnv("GOOGLE_MAPS_API_KEY", MAPS);
  vi.stubEnv("WONDERHOME_WEATHER_PROVIDER", "open-meteo");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", BOOTSTRAP_VALUE);
  vi.stubEnv("CRON_SECRET", "cron-secret-value-1234567");
});

const imported = () => state.rpc.mock.calls.filter(([name]) => name === "platform_config_import");

describe("Move all from Vercel", () => {
  it("is the owner's alone: support and operators are refused before anything is read", async () => {
    for (const role of ["support", "operator"] as const) {
      state.staff = { profileId: `p-${role}`, role };
      expect(await moveAllFromVercelAction(IDLE, form())).toMatchObject({ tone: "risk", report: null });
    }
    state.staff = null;
    expect(await moveAllFromVercelAction(IDLE, form())).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("asks the owner's password again", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    state.password = "wrong";
    expect(await moveAllFromVercelAction(IDLE, form("nope"))).toMatchObject({ tone: "risk", message: "That password didn't match. Nothing was moved." });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("moves what Vercel has, never a bootstrap key, and never returns or logs a value", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    const result = await moveAllFromVercelAction(IDLE, form());
    expect(result.tone).toBe("info");
    const sent = (imported()[0]?.[1] as { p_items: { key: string }[] }).p_items.map((item) => item.key);
    expect(sent.sort()).toEqual(["GOOGLE_MAPS_API_KEY", "WONDERHOME_AI_KEY", "WONDERHOME_WEATHER_PROVIDER"]);
    expect(sent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sent).not.toContain("CRON_SECRET");
    expect(result.report?.counts).toMatchObject({ moved: 3, alreadyInPortal: 0, mustStay: 2, mismatch: 0, failed: 0 });
    expect(result.report?.items.every((row) => row.outcome === "moved")).toBe(true);
    expect(result.report?.safeToDelete.sort()).toEqual(["GOOGLE_MAPS_API_KEY", "WONDERHOME_AI_KEY", "WONDERHOME_WEATHER_PROVIDER"]);
    expect(result.report?.mustStay.map((stay) => stay.key).sort()).toEqual(["CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]);
    // The answer and the log carry names and words, never a secret (not even its last four).
    const payload = JSON.stringify(result);
    const logged = JSON.stringify(state.logs);
    for (const secret of [SECRET, MAPS, BOOTSTRAP_VALUE, "9876", "4321"]) {
      expect(payload).not.toContain(secret);
      expect(logged).not.toContain(secret);
    }
    expect(Object.keys(result.report!.items[0]!).sort()).toEqual(["key", "label", "outcome", "secret", "words"]);
  });

  it("moves nothing the second time", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    await moveAllFromVercelAction(IDLE, form());
    const second = await moveAllFromVercelAction(IDLE, form());
    expect(imported()).toHaveLength(1);
    expect(second.report?.counts).toMatchObject({ moved: 0, alreadyInPortal: 3 });
    expect(second.message).toContain("Nothing new to move");
  });

  it("leaves a setting already saved in the portal alone", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    state.rows.set("WONDERHOME_WEATHER_PROVIDER", { key: "WONDERHOME_WEATHER_PROVIDER", secret: false, value: "off", value_last4: null, updated_at: null, updated_by: null });
    const result = await moveAllFromVercelAction(IDLE, form());
    const sent = (imported()[0]?.[1] as { p_items: { key: string }[] }).p_items.map((item) => item.key);
    expect(sent).not.toContain("WONDERHOME_WEATHER_PROVIDER");
    expect(state.rows.get("WONDERHOME_WEATHER_PROVIDER")?.value).toBe("off");
    expect(result.report?.counts).toMatchObject({ moved: 2, alreadyInPortal: 1 });
  });

  it("says so when what reads back doesn't match Vercel, and doesn't list it as safe to delete", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    state.corrupt = "WONDERHOME_AI_KEY";
    const result = await moveAllFromVercelAction(IDLE, form());
    expect(result.tone).toBe("risk");
    expect(result.report?.items.find((row) => row.key === "WONDERHOME_AI_KEY")?.outcome).toBe("mismatch");
    expect(result.report?.safeToDelete).not.toContain("WONDERHOME_AI_KEY");
    expect(result.report?.counts.mismatch).toBe(1);
  });

  it("reports a Vercel value the setting doesn't accept, without moving it", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    vi.stubEnv("WONDERHOME_WEATHER_PROVIDER", "somewhere-else");
    const result = await moveAllFromVercelAction(IDLE, form());
    expect(result.report?.items.find((row) => row.key === "WONDERHOME_WEATHER_PROVIDER")?.outcome).toBe("invalid");
    expect(result.report?.safeToDelete).not.toContain("WONDERHOME_WEATHER_PROVIDER");
  });
});
