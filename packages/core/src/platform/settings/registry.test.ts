import { describe, expect, it } from "vitest";

import { PLATFORM_SETTINGS, SETTING_GROUPS, lastFourOf, mayEdit, settingDefinition, settingsForPage, validateSetting } from "./registry";

/** Values that must stay in Vercel (docs/progress/2026-11-07-admin-portal.md): never a registry key. */
const BOOTSTRAP = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SECRET_ENCRYPTION_KEY",
  "CRON_SECRET",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "ALEXA_OAUTH_CLIENT_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_WEBHOOK_SECRET",
  "WONDERHOME_LINK_SECRET",
  "CSP_MODE",
  "LOG_LEVEL",
  "WONDERHOME_CONTEXT_STORE",
];

describe("platform settings registry", () => {
  it("has each key once, in the database's key shape", () => {
    const keys = PLATFORM_SETTINGS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[A-Z][A-Z0-9_]{2,80}$/);
  });

  it("never holds a bootstrap value or a build-time one", () => {
    for (const entry of PLATFORM_SETTINGS) {
      expect(BOOTSTRAP).not.toContain(entry.key);
      expect(entry.key.startsWith("NEXT_PUBLIC_")).toBe(false);
      expect(entry.key.startsWith("VERCEL_")).toBe(false);
    }
  });

  it("gives every secret to the owner alone", () => {
    for (const entry of PLATFORM_SETTINGS.filter((e) => e.kind === "secret")) {
      expect(entry.editableBy, entry.key).toBe("owner");
      expect(mayEdit(entry, "operator")).toBe(false);
      expect(mayEdit(entry, "owner")).toBe(true);
    }
  });

  it("never lets support change anything", () => {
    for (const entry of PLATFORM_SETTINGS) expect(mayEdit(entry, "support")).toBe(false);
  });

  it("offers a choice, never free text, where the reader only knows a few values (rule 20)", () => {
    for (const entry of PLATFORM_SETTINGS) {
      if (entry.input.type !== "choice") continue;
      for (const option of entry.input.options) expect(validateSetting(entry, option.value).ok, `${entry.key}=${option.value}`).toBe(true);
      expect(validateSetting(entry, "something-else").ok).toBe(false);
      if (entry.defaultValue !== null) expect(entry.input.options.map((o) => o.value)).toContain(entry.defaultValue);
    }
  });

  it("puts every group on a page", () => {
    const shown = (["ai", "integrations", "configuration"] as const).flatMap((page) => settingsForPage(page).flatMap((group) => group.settings));
    expect(shown).toHaveLength(PLATFORM_SETTINGS.length);
    for (const entry of PLATFORM_SETTINGS) expect(SETTING_GROUPS[entry.group]).toBeDefined();
  });

  it("checks values before saving", () => {
    const number = settingDefinition("WHATSAPP_BUSINESS_NUMBER")!;
    expect(validateSetting(number, "+919876543210")).toEqual({ ok: true, value: "+919876543210" });
    expect(validateSetting(number, "98765").ok).toBe(false);
    const redirects = settingDefinition("ALEXA_OAUTH_REDIRECT_URIS")!;
    expect(validateSetting(redirects, "https://a.example/x, https://b.example/y").ok).toBe(true);
    expect(validateSetting(redirects, "https://a.example/x,http://evil.example").ok).toBe(false);
    const careers = settingDefinition("WONDERJOBS_CAREERS_URL")!;
    expect(validateSetting(careers, "https://jobs.wonderapps.biz").ok).toBe(true);
    expect(validateSetting(careers, "https://wonderapps.biz.evil.example").ok).toBe(false);
    expect(validateSetting(settingDefinition("WONDERHOME_AI_KEY")!, "has a space in it somewhere").ok).toBe(false);
  });

  it("shows at most the last four of a secret, and nothing of a short one", () => {
    expect(lastFourOf("sk-ant-0123456789abcd")).toBe("abcd");
    expect(lastFourOf("short")).toBeNull();
  });

  it("knows only its own keys", () => {
    expect(settingDefinition("SUPABASE_SERVICE_ROLE_KEY")).toBeNull();
  });
});
