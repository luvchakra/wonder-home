import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The 2026-11-22 WhatsApp outage: every WhatsApp setting saved in Platform
 * admin, none left in Vercel, and the webhook refused "hi" as `not_configured`.
 * Next compiles `instrumentation.ts` (which registers the store's loader) and
 * each route into separate module graphs, so the route's copy of
 * `runtime-env.ts` had no loader and read the deployment's variables alone.
 * `vi.resetModules()` gives the second, separate copy the same way.
 */

const SAVED = {
  WHATSAPP_ACCESS_TOKEN: "EAAG-test-access-token-0000",
  WHATSAPP_APP_SECRET: "test-app-secret-1234",
  WHATSAPP_VERIFY_TOKEN: "test-verify-token-5678",
  WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  WHATSAPP_BUSINESS_NUMBER: "+919800000000",
  WHATSAPP_TEMPLATE_NAME: "wonderhome_reminder",
  WHATSAPP_TEMPLATE_LANGUAGE: "en",
};

function noWhatsAppInEnvironment() {
  for (const key of Object.keys(SAVED)) vi.stubEnv(key, "");
}

afterEach(async () => {
  const { useSettingsLoader, forgetRuntimeEnv } = await import("./runtime-env");
  useSettingsLoader(null);
  forgetRuntimeEnv();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("WhatsApp settings saved in Platform admin reach the webhook", () => {
  it("a route's own copy of the module sees the loader instrumentation registered", async () => {
    noWhatsAppInEnvironment();
    // Instrumentation's module graph.
    const instrumentation = await import("./runtime-env");
    const { overlayOf } = await import("./overlay");
    instrumentation.useSettingsLoader(async () => ({ ...SAVED }), overlayOf);
    await instrumentation.refreshRuntimeEnv();

    // The route's module graph: fresh copies of every module.
    vi.resetModules();
    const route = await import("./runtime-env");
    const { whatsappConfigFromEnv, whatsappMissingSettings } = await import("../../notifications/whatsapp");
    expect(route).not.toBe(instrumentation);

    const env = await route.settledSettingsEnv();
    const config = whatsappConfigFromEnv(env);
    expect(config).not.toBeNull();
    expect(config?.appSecret).toBe(SAVED.WHATSAPP_APP_SECRET);
    expect(config?.verifyToken).toBe(SAVED.WHATSAPP_VERIFY_TOKEN);
    expect(whatsappMissingSettings(env)).toEqual([]);
    expect(route.settingsStoreState()).toBe("loaded");
  });

  it("a cold server with a loader and nothing read yet waits for the store, not the empty environment", async () => {
    noWhatsAppInEnvironment();
    const runtime = await import("./runtime-env");
    const { overlayOf } = await import("./overlay");
    const { whatsappConfigFromEnv } = await import("../../notifications/whatsapp");
    runtime.useSettingsLoader(() => new Promise((resolve) => setTimeout(() => resolve({ ...SAVED }), 50)), overlayOf);
    expect(whatsappConfigFromEnv(await runtime.settledSettingsEnv())?.appSecret).toBe(SAVED.WHATSAPP_APP_SECRET);
  });

  it("a copy older than a save on another server is read again before refusing", async () => {
    noWhatsAppInEnvironment();
    const runtime = await import("./runtime-env");
    const { overlayOf } = await import("./overlay");
    const { whatsappConfigFromEnv, whatsappMissingSettings } = await import("../../notifications/whatsapp");
    let rows: Record<string, string> = { ...SAVED };
    delete rows.WHATSAPP_APP_SECRET;
    runtime.useSettingsLoader(async () => ({ ...rows }), overlayOf);
    await runtime.refreshRuntimeEnv(1_000);
    const before = runtime.runtimeEnv(1_000);
    expect(whatsappConfigFromEnv(before)?.appSecret ?? null).toBeNull();
    expect(whatsappMissingSettings(before)).toEqual(["WHATSAPP_APP_SECRET"]);

    rows = { ...SAVED }; // saved on another server
    const after = await runtime.reloadedSettingsEnv(2_500, 20_000);
    expect(whatsappConfigFromEnv(after)?.appSecret).toBe(SAVED.WHATSAPP_APP_SECRET);
  });

  it("forced reads are at most one per ten seconds", async () => {
    const runtime = await import("./runtime-env");
    const load = vi.fn(async () => ({}));
    runtime.useSettingsLoader(load);
    await runtime.reloadedSettingsEnv(2_500, 100_000);
    await runtime.reloadedSettingsEnv(2_500, 105_000);
    expect(load).toHaveBeenCalledTimes(1);
    await runtime.reloadedSettingsEnv(2_500, 111_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a server with no loader says so", async () => {
    const runtime = await import("./runtime-env");
    runtime.useSettingsLoader(null);
    expect(runtime.settingsStoreState()).toBe("no_loader");
  });
});
