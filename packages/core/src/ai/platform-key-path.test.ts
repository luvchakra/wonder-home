import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A key saved in Platform admin is the key every model path sends (2026-11-21:
 * the runner kept sending the repository's old secret for six days after the
 * owner saved a new key in the portal, and a cold server could send the
 * deployment's variable before its first read of the saved values).
 */

const SAVED = `sk-ant-${"saved-in-platform-admin-0000000000SAVE"}`;
const DEPLOYED = `sk-ant-${"old-deployment-variable-00000000000OLD"}`;

const seen: string[] = [];
vi.mock("./classify-intake", () => ({
  classifyIntake: async (_provider: string, key: string) => {
    seen.push(key);
    return null;
  },
}));
vi.mock("./credentials", () => ({ readHouseholdKey: async () => null, readGeminiVoiceKey: async () => null }));

const runtime = await import("../platform/settings/runtime-env");
const { currentPlatformKey } = await import("./model-key");
const { ingestText } = await import("../homesend/ingest");
const { runJob } = await import("../jobs/runner");
const { fakeSupabase } = await import("../homesend/testing");

const previous = process.env.WONDERHOME_AI_KEY;
beforeEach(() => {
  seen.length = 0;
  process.env.WONDERHOME_AI_KEY = DEPLOYED;
});
afterEach(() => {
  runtime.useSettingsLoader(null);
  if (previous === undefined) delete process.env.WONDERHOME_AI_KEY;
  else process.env.WONDERHOME_AI_KEY = previous;
});

/** A server whose saved values arrive only after `delayMs` (a cold start's slow first read). */
function savedKeyArrivingAfter(delayMs: number) {
  runtime.forgetRuntimeEnv();
  runtime.useSettingsLoader(
    () => new Promise((resolve) => setTimeout(() => resolve({ WONDERHOME_AI_KEY: SAVED, WONDERHOME_AI_PROVIDER: "anthropic" }), delayMs)),
    (rows) => rows,
  );
}

describe("the saved platform key is the one every model path sends", () => {
  it("a cold server waits for its first read instead of sending the deployment's variable", async () => {
    savedKeyArrivingAfter(30);
    expect(runtime.runtimeEnv().WONDERHOME_AI_KEY).toBe(DEPLOYED); // what the synchronous read would have sent
    expect((await currentPlatformKey())?.key).toBe(SAVED);
  });

  it("HomeSend's reading (WhatsApp, email, share, upload: one pipeline) is sent the saved key", async () => {
    savedKeyArrivingAfter(10);
    await ingestText(fakeSupabase().client, { householdId: "11111111-1111-4111-8111-111111111111", memberId: "22222222-2222-4222-8222-222222222222" }, { text: "Exam timetable" });
    expect(seen).toEqual([SAVED]);
  });

  it("the background-jobs runner sees the saved key, not only its own secret", async () => {
    delete process.env.WONDERHOME_AI_KEY;
    savedKeyArrivingAfter(0);
    await runtime.refreshRuntimeEnv();
    const ran: string[] = [];
    const result = await runJob({} as never, "clock", {
      runners: Object.fromEntries(["clock.context-warm", "clock.knowledge", "clock.homesend-archive", "clock.homesend-tidy", "clock.homesend-deadlines", "clock.homebrain-sleep", "clock.trivia-refill"].map((step) => [step, async () => (ran.push(step), {})])),
    } as never);
    // Without the saved key the model steps would be "left to Vercel".
    expect(result.steps.find((step) => step.step === "clock.homesend-tidy")?.state).not.toBe("left-to-vercel");
    expect(ran).toContain("clock.homebrain-sleep");
  });

  it("no model path reads the key from the environment directly or from the synchronous copy", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const text = readFileSync(path, "utf8");
          const file = relative(root, path);
          if (/process\.env\.WONDERHOME_AI_KEY/.test(text)) offenders.push(`${file}: process.env.WONDERHOME_AI_KEY`);
          // A model call resolves its key with `currentPlatformKey()`; `platformKey()` is for screens that only describe it.
          if (/resolveModelKey\([^)]*platformKey\(\)/.test(text) && !/settings\/(ai\/)?page\.tsx$/.test(file)) offenders.push(`${file}: resolveModelKey(…, platformKey())`);
        }
      }
    };
    walk(join(root, "packages", "core", "src"));
    walk(join(root, "apps", "web", "app"));
    expect(offenders).toEqual([]);
  });
});
