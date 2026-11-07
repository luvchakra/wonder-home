import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  staff: null as null | { profileId: string; role: "support" | "operator" | "owner" },
  password: "ok" as "ok" | "wrong" | "limited" | "unavailable",
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("../_lib/platform-staff", () => ({
  platformStaff: vi.fn(async (capability: string) => {
    if (!state.staff) return null;
    const { platformCan } = await import("@wonderhome/core/platform/admin");
    return platformCan(state.staff, capability) ? state.staff : null;
  }),
}));
vi.mock("../_lib/platform-step-up", () => ({ confirmStaffPassword: vi.fn(async () => state.password) }));

const { clearSettingAction, saveSettingAction } = await import("./settings-actions");

const IDLE = { tone: null, message: null, key: null };
const form = (key: string, value?: string, password?: string) => {
  const data = new FormData();
  data.set("key", key);
  if (value !== undefined) data.set(`value__${key}`, value);
  if (password !== undefined) data.set(`password__${key}`, password);
  return data;
};

beforeEach(() => {
  state.staff = null;
  state.password = "ok";
  state.rpc = vi.fn(async (name: string) => ({ data: name === "platform_config_secret_set" ? "1234" : null, error: null }));
});

describe("platform setting actions", () => {
  it("change nothing for anyone who isn't staff, or for support", async () => {
    expect(await saveSettingAction(IDLE, form("WONDERHOME_WEATHER_PROVIDER", "off"))).toMatchObject({ tone: "risk" });
    state.staff = { profileId: "p-support", role: "support" };
    expect(await saveSettingAction(IDLE, form("WONDERHOME_WEATHER_PROVIDER", "off"))).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("let an operator change a setting, through the audited function, with who did it", async () => {
    state.staff = { profileId: "p-op", role: "operator" };
    expect(await saveSettingAction(IDLE, form("WONDERHOME_WEATHER_PROVIDER", "open-meteo"))).toMatchObject({ tone: "info" });
    expect(state.rpc).toHaveBeenCalledWith("platform_config_set", { p_key: "WONDERHOME_WEATHER_PROVIDER", p_value: "open-meteo", p_actor: "p-op" });
  });

  it("keep secrets and owner-only settings from an operator", async () => {
    state.staff = { profileId: "p-op", role: "operator" };
    expect(await saveSettingAction(IDLE, form("GOOGLE_MAPS_API_KEY", "AIzaSyExampleExample1234", "pw"))).toMatchObject({ tone: "risk", message: "Only the owner can change a secret." });
    expect(await saveSettingAction(IDLE, form("ALEXA_OAUTH_REDIRECT_URIS", "https://a.example/x"))).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("ask the owner's password again for a secret, and never echo its value", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    state.password = "wrong";
    expect(await saveSettingAction(IDLE, form("GOOGLE_MAPS_API_KEY", "AIzaSyExampleExample1234", "nope"))).toMatchObject({ tone: "risk", message: "That password didn't match. Nothing was changed." });
    expect(state.rpc).not.toHaveBeenCalled();
    state.password = "ok";
    const saved = await saveSettingAction(IDLE, form("GOOGLE_MAPS_API_KEY", "AIzaSyExampleExample1234", "right"));
    expect(saved).toMatchObject({ tone: "info" });
    expect(saved.message).toContain("••••1234");
    expect(saved.message).not.toContain("AIzaSy");
    expect(state.rpc).toHaveBeenCalledWith("platform_config_secret_set", { p_key: "GOOGLE_MAPS_API_KEY", p_value: "AIzaSyExampleExample1234", p_actor: "p-owner" });
  });

  it("refuse a key outside the registry", async () => {
    state.staff = { profileId: "p-owner", role: "owner" };
    expect(await saveSettingAction(IDLE, form("SUPABASE_SERVICE_ROLE_KEY", "x", "pw"))).toMatchObject({ tone: "risk" });
    expect(await clearSettingAction(IDLE, form("CRON_SECRET", undefined, "pw"))).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuse an invalid value with the reason", async () => {
    state.staff = { profileId: "p-op", role: "operator" };
    const result = await saveSettingAction(IDLE, form("WHATSAPP_BUSINESS_NUMBER", "12345"));
    expect(result.tone).toBe("risk");
    expect(result.message).toContain("international format");
  });

  it("clear a setting back to Vercel's value", async () => {
    state.staff = { profileId: "p-op", role: "operator" };
    expect(await clearSettingAction(IDLE, form("WONDERHOME_WEATHER_PROVIDER"))).toMatchObject({ tone: "info" });
    expect(state.rpc).toHaveBeenCalledWith("platform_config_clear", { p_key: "WONDERHOME_WEATHER_PROVIDER", p_actor: "p-op" });
  });
});
