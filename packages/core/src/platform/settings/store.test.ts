import { describe, expect, it, vi } from "vitest";

import { settingDefinition } from "./registry";
import { clearSetting, loadStoredSettings, saveSetting, statusFor } from "./store";

const secret = settingDefinition("GOOGLE_MAPS_API_KEY")!;
const config = settingDefinition("WONDERHOME_WEATHER_PROVIDER")!;
const row = (over: Partial<{ key: string; secret: boolean; value: string | null; value_last4: string | null; updated_at: string | null }>) => ({
  key: "K",
  secret: false,
  value: null,
  value_last4: null,
  updated_at: "2026-11-07T10:00:00Z",
  ...over,
});

describe("statusFor", () => {
  it("prefers a saved value, then the environment, then the default", () => {
    expect(statusFor(config, row({ value: "off" }), { WONDERHOME_WEATHER_PROVIDER: "open-meteo" })).toMatchObject({ source: "saved", value: "off", inEnvironment: true });
    expect(statusFor(config, undefined, { WONDERHOME_WEATHER_PROVIDER: "open-meteo" })).toMatchObject({ source: "environment", value: "open-meteo" });
    expect(statusFor(config, undefined, {})).toMatchObject({ source: "default", value: "off" });
    expect(statusFor(settingDefinition("WHATSAPP_TEMPLATE_NAME")!, undefined, {})).toMatchObject({ source: "unset", value: null });
  });

  it("never carries a secret's value, only its last four", () => {
    const fromEnv = statusFor(secret, undefined, { GOOGLE_MAPS_API_KEY: "AIzaSyExampleExample1234" });
    expect(fromEnv).toMatchObject({ source: "environment", value: null, last4: "1234" });
    expect(JSON.stringify(fromEnv)).not.toContain("AIzaSy");
    expect(statusFor(secret, row({ secret: true, value_last4: "wxyz" }), {})).toMatchObject({ source: "saved", value: null, last4: "wxyz" });
  });
});

function client(result: { data?: unknown; error?: { code?: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { rpc } as unknown as Parameters<typeof saveSetting>[0] & { rpc: typeof rpc };
}

describe("saveSetting and clearSetting", () => {
  it("refuses a key outside the registry and an invalid value without calling the database", async () => {
    const admin = client({});
    expect(await saveSetting(admin, "p1", "SUPABASE_SERVICE_ROLE_KEY", "x")).toEqual({ ok: false, reason: "unknown" });
    expect(await saveSetting(admin, "p1", "WONDERHOME_WEATHER_PROVIDER", "sunny")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await clearSetting(admin, "p1", "CRON_SECRET")).toEqual({ ok: false, reason: "unknown" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("sends a secret to the Vault function and a setting to the plain one", async () => {
    const admin = client({ data: "1234" });
    expect(await saveSetting(admin, "p1", "GOOGLE_MAPS_API_KEY", "AIzaSyExampleExample1234")).toEqual({ ok: true, last4: "1234" });
    expect(admin.rpc).toHaveBeenCalledWith("platform_config_secret_set", { p_key: "GOOGLE_MAPS_API_KEY", p_value: "AIzaSyExampleExample1234", p_actor: "p1" });
    await saveSetting(admin, "p1", "WONDERHOME_WEATHER_PROVIDER", "open-meteo");
    expect(admin.rpc).toHaveBeenLastCalledWith("platform_config_set", { p_key: "WONDERHOME_WEATHER_PROVIDER", p_value: "open-meteo", p_actor: "p1" });
  });

  it("says when the database's rate limit refused it", async () => {
    expect(await saveSetting(client({ error: { code: "P0001" } }), "p1", "WONDERHOME_WEATHER_PROVIDER", "off")).toEqual({ ok: false, reason: "limited" });
  });

  it("reads nothing, not an error, before the migration is applied", async () => {
    expect(await loadStoredSettings(client({ error: { code: "PGRST202" } }))).toEqual({});
  });

  it("keeps only registry keys from the store", async () => {
    expect(await loadStoredSettings(client({ data: [{ key: "TMDB_API_KEY", value: "abc" }, { key: "CRON_SECRET", value: "x" }] }))).toEqual({ TMDB_API_KEY: "abc" });
  });
});
