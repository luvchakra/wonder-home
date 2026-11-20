import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import * as models from "../../ai/model-client";
import { platformKey } from "../../ai/model-key";
import { overlayOf } from "./overlay";
import { settingDefinition } from "./registry";
import { STORE_ONLY_KEYS, aiSettingsFromEnvironmentAllowed, forgetRuntimeEnv, refreshRuntimeEnv, runtimeEnv, runtimeEnvForAi, useSettingsLoader, type StoredSettings } from "./runtime-env";
import { statusFor } from "./store";

/** Built at run time so no line looks like a committed key. */
const fakeAnthropic = (tail: string) => ["sk", "ant", tail].join("-");

/**
 * WonderHome's own AI settings live in one place, Platform admin (owner,
 * 2026-11-21). These tests are the guarantee behind the card's words
 * "WonderHome ignores it": on a deployment a Vercel variable or GitHub secret
 * of the same name never reaches a reader, and no code reads one directly.
 */

const root = join(__dirname, "../../../../..");
const use = (load: (() => Promise<StoredSettings>) | null) => useSettingsLoader(load, overlayOf);

/** Pretend to be the production deployment: not tooling. */
function asDeployment() {
  vi.stubEnv("VITEST", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
}

afterEach(() => {
  vi.unstubAllEnvs();
  use(null);
  forgetRuntimeEnv();
});

describe("one place for WonderHome's AI settings", () => {
  it("every store-only name is a Platform admin setting", () => {
    for (const key of STORE_ONLY_KEYS) expect(settingDefinition(key), key).toBeDefined();
  });

  it("on the deployment, a Vercel copy of the key is never handed out, before or after the store loads", async () => {
    asDeployment();
    vi.stubEnv("WONDERHOME_AI_KEY", fakeAnthropic("old-copy-in-vercel-000000"));
    vi.stubEnv("WONDERHOME_AI_UNDERSTANDING_MODEL", "old-model");
    use(async () => ({}));
    expect(platformKey(runtimeEnv(Number.NEGATIVE_INFINITY))).toBeNull(); // not loaded: no key, never the stale copy
    await refreshRuntimeEnv(1_000);
    expect(platformKey(runtimeEnv(1_000))).toBeNull(); // loaded, nothing saved: still no key
    expect(runtimeEnv(1_000).WONDERHOME_AI_UNDERSTANDING_MODEL).toBeUndefined();
  });

  it("on the deployment, the saved key is the one used", async () => {
    asDeployment();
    vi.stubEnv("WONDERHOME_AI_KEY", fakeAnthropic("old-copy-in-vercel-000000"));
    use(async () => ({ WONDERHOME_AI_KEY: fakeAnthropic("saved-in-platform-admin-1"), WONDERHOME_AI_PROVIDER: "anthropic" }));
    await refreshRuntimeEnv(1_000);
    expect(platformKey(runtimeEnv(1_000))).toEqual({ provider: "anthropic", key: fakeAnthropic("saved-in-platform-admin-1") });
  });

  it("model names come from Platform admin and change when it does, without a deploy", async () => {
    asDeployment();
    vi.stubEnv("WONDERHOME_AI_UNDERSTANDING_MODEL", "old-model-in-vercel");
    use(async () => ({ WONDERHOME_AI_UNDERSTANDING_MODEL: "claude-haiku-saved" }));
    await refreshRuntimeEnv(1_000);
    expect(models.CLAUDE_UNDERSTANDING_MODEL).toBe("claude-haiku-saved");
    use(null);
    expect(models.CLAUDE_UNDERSTANDING_MODEL).toBe("claude-haiku-5-5"); // nothing saved: the default, never Vercel's
  });

  it("a server that can't read the store behaves as no key, after waiting", async () => {
    asDeployment();
    vi.stubEnv("WONDERHOME_AI_KEY", fakeAnthropic("old-copy-in-vercel-000000"));
    const load = vi.fn(async (): Promise<StoredSettings> => {
      throw new Error("down");
    });
    use(load);
    expect(platformKey(await runtimeEnvForAi(10))).toBeNull();
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("only tooling may take them from the environment, and never on Vercel", () => {
    expect(aiSettingsFromEnvironmentAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(aiSettingsFromEnvironmentAllowed({ VITEST: "true" })).toBe(true);
    expect(aiSettingsFromEnvironmentAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(aiSettingsFromEnvironmentAllowed({ NODE_ENV: "development", VERCEL: "1" })).toBe(false);
  });

  it("the card never says a Vercel copy of an AI setting is in use", () => {
    const entry = settingDefinition("WONDERHOME_AI_KEY")!;
    const status = statusFor(entry, undefined, { WONDERHOME_AI_KEY: fakeAnthropic("old-copy-in-vercel-000000") });
    expect(status).toMatchObject({ source: "unset", inEnvironment: true, storeOnly: true });
  });

  it("no code reads an AI setting from process.env directly, and no workflow passes one", () => {
    const names = STORE_ONLY_KEYS.join("|");
    const direct = new RegExp(`process\\.env(\\.(${names})\\b|\\[["'](${names})["']\\])`);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|mjs|mts|js)$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.endsWith("runtime-env.ts")) {
          if (direct.test(readFileSync(path, "utf8"))) offenders.push(relative(root, path));
        }
      }
    };
    for (const dir of ["apps/web/app", "apps/web/lib", "packages", "scripts"]) {
      try {
        walk(join(root, dir));
      } catch {
        // a folder this checkout doesn't have
      }
    }
    expect(offenders).toEqual([]);
    const workflows = join(root, ".github/workflows");
    for (const file of readdirSync(workflows)) expect(readFileSync(join(workflows, file), "utf8"), file).not.toMatch(new RegExp(`secrets\\.(${names})\\b`));
  });
});
