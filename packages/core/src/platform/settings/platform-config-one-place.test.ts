import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { googleAuthEnabled, phoneAuthEnabled } from "../../config/auth-providers";
import { contactEmail } from "../../config/contact";
import { platformResendConfig } from "../../homesend/email-gateway";
import { whatsappConfigFromEnv } from "../../notifications/whatsapp";
import { unsubscribeSecret } from "../../notifications/unsubscribe";
import { voiceOAuthClients } from "../../voicelink/oauth";
import { configurationHealth } from "./health";
import { overlayOf } from "./overlay";
import { FALLBACK_NAMES, STAYS_IN_VERCEL, environmentValueOf, settingDefinition } from "./registry";
import { STORE_ONLY_KEYS, forgetRuntimeEnv, refreshRuntimeEnv, runtimeEnv, settledSettingsEnv, useSettingsLoader, type StoredSettings } from "./runtime-env";
import { statusFor, type SettingStatus } from "./store";

/** Moved from Vercel to Platform admin on 2026-11-22 (owner: "bring these configs to platform admin instead of vercel"). */
const MOVED = [
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "ALEXA_OAUTH_CLIENT_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_WEBHOOK_SECRET",
  "WONDERHOME_LINK_SECRET",
  "WONDERHOME_CONTEXT_STORE",
  "WONDERHOME_CONTACT_EMAIL",
  "WONDERHOME_GOOGLE_SIGN_IN",
  "WONDERHOME_PHONE_SIGN_IN",
] as const;

const root = join(__dirname, "../../../../..");
const use = (load: (() => Promise<StoredSettings>) | null) => useSettingsLoader(load, overlayOf);
const WHATSAPP = { WHATSAPP_ACCESS_TOKEN: "token-0123456789abcdefghij", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_TEMPLATE_NAME: "reminder" };

afterEach(() => {
  use(null);
  forgetRuntimeEnv();
  vi.unstubAllEnvs();
});

describe("Platform admin holds the webhook secrets and switches (2026-11-22)", () => {
  it("each moved key is a Platform admin setting, secrets owner-only, and none still listed as staying in Vercel", () => {
    const stays = STAYS_IN_VERCEL.map((item) => item.key);
    for (const key of MOVED) {
      const entry = settingDefinition(key);
      expect(entry, key).not.toBeNull();
      expect(stays).not.toContain(key);
      if (entry!.kind === "secret") expect(entry!.editableBy).toBe("owner");
    }
    for (const key of ["WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "RAZORPAY_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET", "RESEND_WEBHOOK_SECRET", "ALEXA_OAUTH_CLIENT_SECRET", "WONDERHOME_LINK_SECRET"]) {
      expect(settingDefinition(key)!.kind, key).toBe("secret");
    }
  });

  it("during the switch-over they are not store-only: Vercel's value still answers until one is saved", () => {
    for (const key of MOVED) expect(STORE_ONLY_KEYS).not.toContain(key);
  });

  it("the saved value wins over Vercel's for every moved reader", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "vercel-app-secret");
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "vercel-verify");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_vercel");
    vi.stubEnv("WONDERHOME_LINK_SECRET", "vercel-link-secret-0000");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "old@example.org");
    use(async () => ({
      ...WHATSAPP,
      WHATSAPP_APP_SECRET: "saved-app-secret",
      WHATSAPP_VERIFY_TOKEN: "saved-verify",
      RESEND_API_KEY: "re_saved_key",
      RESEND_WEBHOOK_SECRET: "whsec_saved",
      WONDERHOME_LINK_SECRET: "saved-link-secret-00000",
      ALEXA_OAUTH_CLIENT_ID: "alexa-client",
      ALEXA_OAUTH_CLIENT_SECRET: "saved-alexa-secret-000",
      ALEXA_OAUTH_REDIRECT_URIS: "https://layla.amazon.com/api/skill/link/X",
      WONDERHOME_GOOGLE_SIGN_IN: "off",
      WONDERHOME_PHONE_SIGN_IN: "on",
      WONDERHOME_CONTACT_EMAIL: "hello@example.org",
    }));
    await refreshRuntimeEnv();
    const whatsapp = whatsappConfigFromEnv();
    expect(whatsapp?.appSecret).toBe("saved-app-secret");
    expect(whatsapp?.verifyToken).toBe("saved-verify");
    expect(platformResendConfig()?.webhookSecret).toBe("whsec_saved");
    expect(unsubscribeSecret()).toBe("saved-link-secret-00000");
    expect(voiceOAuthClients()[0]?.clientSecret).toBe("saved-alexa-secret-000");
    expect(googleAuthEnabled()).toBe(false);
    expect(phoneAuthEnabled()).toBe(true);
    expect(contactEmail()).toBe("hello@example.org");
  });

  it("with nothing saved, Vercel's value is used (the safe transition), and neither means not set", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", WHATSAPP.WHATSAPP_ACCESS_TOKEN);
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
    vi.stubEnv("WHATSAPP_TEMPLATE_NAME", "reminder");
    vi.stubEnv("WHATSAPP_APP_SECRET", "vercel-app-secret");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "old@example.org");
    use(async () => ({}));
    const env = await settledSettingsEnv(50);
    expect(whatsappConfigFromEnv(env)?.appSecret).toBe("vercel-app-secret");
    expect(whatsappConfigFromEnv(env)?.verifyToken).toBeNull();
    expect(googleAuthEnabled(env)).toBe(true);
    expect(contactEmail(env)).toBe("old@example.org");
    expect(runtimeEnv().WONDERHOME_CONTEXT_STORE).toBeUndefined();
  });

  it("the card says where a value comes from: saved, Vercel's (old name included), or not set", () => {
    const secret = settingDefinition("WHATSAPP_APP_SECRET")!;
    expect(statusFor(secret, undefined, { WHATSAPP_APP_SECRET: "vercel-app-secret-123" }).source).toBe("environment");
    expect(statusFor(secret, undefined, {}).source).toBe("unset");
    expect(statusFor(secret, { key: secret.key, value: "", value_last4: "abcd", updated_at: "2026-11-22T00:00:00Z" } as never, { WHATSAPP_APP_SECRET: "x" }).source).toBe("saved");
    const google = settingDefinition("WONDERHOME_GOOGLE_SIGN_IN")!;
    expect(environmentValueOf(google, { NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "true" })).toBe("on");
    expect(statusFor(google, undefined, { NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "true" })).toMatchObject({ source: "environment", value: "on" });
    expect(FALLBACK_NAMES).toEqual(expect.arrayContaining(["NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "NEXT_PUBLIC_PHONE_AUTH_ENABLED", "NEXT_PUBLIC_CONTACT_EMAIL"]));
  });

  it("configuration health names a half-set-up service, and stays quiet otherwise", () => {
    const status = (source: SettingStatus["source"]) => ({ source }) as SettingStatus;
    expect(configurationHealth(new Map())).toEqual([]);
    const gaps = configurationHealth(new Map([["WHATSAPP_ACCESS_TOKEN", status("saved")], ["WHATSAPP_PHONE_NUMBER_ID", status("saved")], ["WHATSAPP_TEMPLATE_NAME", status("saved")], ["WHATSAPP_VERIFY_TOKEN", status("environment")]]));
    expect(gaps.map((gap) => gap.words)).toEqual(["WhatsApp app secret is not set — WhatsApp messages are refused."]);
  });

  it("no code reads a moved setting from process.env directly, and no workflow passes one", () => {
    const names = [...MOVED].join("|");
    const direct = new RegExp(`process\\.env(\\.(${names})\\b|\\[["'](${names})["']\\])`);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|mjs|mts)$/.test(name) && !/\.test\.tsx?$/.test(name) && direct.test(readFileSync(path, "utf8"))) offenders.push(relative(root, path));
      }
    };
    for (const dir of ["apps/web/app", "packages", "scripts"]) walk(join(root, dir));
    expect(offenders).toEqual([]);
    const workflows = join(root, ".github/workflows");
    for (const file of readdirSync(workflows)) expect(readFileSync(join(workflows, file), "utf8"), file).not.toMatch(new RegExp(`secrets\\.(${names})\\b`));
  });
});
