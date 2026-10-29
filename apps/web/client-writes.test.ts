import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The client keeps a screen it showed for 30 seconds (next.config `staleTimes`).
 * A Server Action that writes purges that copy itself; a write made with
 * fetch() does not, so the code that makes it calls router.refresh() (or hands
 * the change to a callback that does). Every client file that sends a POST,
 * PUT, PATCH or DELETE to the API is held to that here, unless it is listed
 * below with the reason it changes nothing another screen shows.
 */

const ROOT = join(__dirname, "../..");
const DIRS = ["apps/web/app", "packages/core/src/components"];

const CHANGES_NOTHING_SHOWN: Record<string, string> = {
  "apps/web/app/_components/checkout-button.tsx": "Leaves the app for the payment page with a full navigation, which drops every kept screen.",
  "apps/web/app/_components/privacy-forms.tsx": "Downloads an export built in the reply; nothing is stored.",
  "apps/web/app/_components/voice-forms.tsx": "Plays a voice preview; settings themselves save through a Server Action.",
  "apps/web/app/ai/welcome-voice.tsx": "Speaks a greeting aloud.",
  "packages/core/src/components/ui/use-live-voice.tsx": "Speaks a reply aloud.",
  "packages/core/src/components/ui/use-speech-to-text.tsx": "Turns speech into text; nothing is stored.",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const writers = DIRS.flatMap((dir) => files(join(ROOT, dir)))
  .map((path) => ({ path: relative(ROOT, path), source: readFileSync(path, "utf8") }))
  .filter(({ source }) => /^["']use client["']/m.test(source) && /fetch\([^)]*\/api\/v1\/[\s\S]{0,400}?method:\s*"(POST|PUT|PATCH|DELETE)"/.test(source));

describe("a write made from the browser never leaves a stale screen behind", () => {
  it("finds the browser's writers", () => {
    expect(writers.map(({ path }) => path)).toEqual(expect.arrayContaining(["apps/web/app/ai/assistant.tsx", "packages/core/src/components/ui/live-talk.tsx"]));
  });

  it("refreshes after each one, or says why it need not", () => {
    const stale = writers
      .filter(({ path }) => !(path in CHANGES_NOTHING_SHOWN))
      .filter(({ source }) => !/router\.refresh\(\)|onChanged\?\.\(\)|onNavigate\?\.\(/.test(source))
      .map(({ path }) => path);
    expect(stale).toEqual([]);
  });

  it("lists only files that still write", () => {
    const writing = new Set(writers.map(({ path }) => path));
    for (const path of Object.keys(CHANGES_NOTHING_SHOWN)) expect(writing.has(path), path).toBe(true);
  });
});
