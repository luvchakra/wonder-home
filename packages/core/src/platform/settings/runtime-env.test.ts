import { afterEach, describe, expect, it, vi } from "vitest";

import { overlayOf } from "./overlay";
import { forgetRuntimeEnv, freshRuntimeEnv, refreshRuntimeEnv, runtimeEnv, useSettingsLoader as useLoader, type StoredSettings } from "./runtime-env";

const useSettingsLoader = (load: (() => Promise<StoredSettings>) | null) => useLoader(load, overlayOf);

afterEach(() => {
  useSettingsLoader(null);
  forgetRuntimeEnv();
  vi.unstubAllEnvs();
});

describe("runtimeEnv: saved value → environment variable → the reader's default", () => {
  it("is the plain environment when nothing is saved or no loader is set", () => {
    vi.stubEnv("WONDERHOME_WEATHER_PROVIDER", "open-meteo");
    expect(runtimeEnv()).toBe(process.env);
    expect(runtimeEnv().WONDERHOME_WEATHER_PROVIDER).toBe("open-meteo");
  });

  it("lays a saved value over the variable, and leaves the rest alone", async () => {
    vi.stubEnv("WONDERHOME_WEATHER_PROVIDER", "open-meteo");
    vi.stubEnv("WHATSAPP_TEMPLATE_LANGUAGE", "en");
    useSettingsLoader(async () => ({ WONDERHOME_WEATHER_PROVIDER: "off" }));
    await refreshRuntimeEnv(1_000);
    const env = runtimeEnv(1_000);
    expect(env.WONDERHOME_WEATHER_PROVIDER).toBe("off");
    expect(env.WHATSAPP_TEMPLATE_LANGUAGE).toBe("en");
    expect(process.env.WONDERHOME_WEATHER_PROVIDER).toBe("open-meteo"); // never written to process.env
  });

  it("never lets a row stand in for a value outside the registry", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "the-real-one");
    useSettingsLoader(async () => ({ SUPABASE_SERVICE_ROLE_KEY: "planted", CRON_SECRET: "planted" }));
    await refreshRuntimeEnv(1_000);
    expect(runtimeEnv(1_000).SUPABASE_SERVICE_ROLE_KEY).toBe("the-real-one");
    expect(runtimeEnv(1_000).CRON_SECRET).toBe(process.env.CRON_SECRET);
  });

  it("hands a reader that only checks for 'set' an empty value for a saved 'off'", () => {
    expect(overlayOf({ WONDERHOME_SCHOOL_DEMO: "off" })).toEqual({ WONDERHOME_SCHOOL_DEMO: "" });
    expect(overlayOf({ WONDERHOME_SCHOOL_DEMO: "on" })).toEqual({ WONDERHOME_SCHOOL_DEMO: "on" });
  });

  it("keeps values for a minute, then refreshes behind the read", async () => {
    let value = "on";
    const load = vi.fn(async () => ({ WONDERHOME_DEVELOPER_API: value }));
    useSettingsLoader(load);
    await refreshRuntimeEnv(0);
    value = "off";
    expect(runtimeEnv(30_000).WONDERHOME_DEVELOPER_API).toBe("on");
    expect(load).toHaveBeenCalledTimes(1);
    expect((await freshRuntimeEnv(61_000)).WONDERHOME_DEVELOPER_API).toBe("off");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("sees a save at once on the server that made it", async () => {
    let value = "on";
    useSettingsLoader(async () => ({ WONDERHOME_DEVELOPER_API: value }));
    await refreshRuntimeEnv(0);
    value = "off";
    forgetRuntimeEnv();
    expect((await freshRuntimeEnv(1)).WONDERHOME_DEVELOPER_API).toBe("off");
  });

  it("keeps the last values when the store can't be read", async () => {
    let fail = false;
    useSettingsLoader(async () => {
      if (fail) throw new Error("down");
      return { WONDERHOME_DEVELOPER_API: "on" };
    });
    await refreshRuntimeEnv(0);
    fail = true;
    await refreshRuntimeEnv(61_000);
    expect(runtimeEnv(61_000).WONDERHOME_DEVELOPER_API).toBe("on");
  });

  it("drops a value once it is cleared", async () => {
    let rows: Record<string, string> = { WONDERHOME_DEVELOPER_API: "on" };
    useSettingsLoader(async () => rows);
    await refreshRuntimeEnv(0);
    rows = {};
    forgetRuntimeEnv();
    expect((await freshRuntimeEnv(1)).WONDERHOME_DEVELOPER_API).toBe(process.env.WONDERHOME_DEVELOPER_API);
  });
});
