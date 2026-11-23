import { describe, expect, it } from "vitest";

import { cronAuthorized, keyMatches, schedulerKeyWords } from "./cron-auth";

const call = (authorization?: string) => new Request("https://home.wonderapps.biz/api/v1/notifications/dispatch", { method: "POST", headers: authorization ? { authorization } : {} });
const sources = (deployment: string | undefined, saved: string | undefined, reloaded: string | undefined = saved) => ({
  deployment,
  saved: async () => ({ CRON_SECRET: saved }),
  reloaded: async () => ({ CRON_SECRET: reloaded }),
});
const SAVED = "saved-key-0123456789abcdefghijklmnop";
const VERCEL = "vercel-key-0123456789abcdefghijklmnop";

describe("the scheduler key on every scheduler route (2026-11-23)", () => {
  it("accepts the key saved in Platform admin or Vercel's, and nothing else", async () => {
    expect(await cronAuthorized(call(`Bearer ${SAVED}`), sources(VERCEL, SAVED))).toBe(true);
    expect(await cronAuthorized(call(`Bearer ${VERCEL}`), sources(VERCEL, SAVED))).toBe(true);
    expect(await cronAuthorized(call("Bearer nope"), sources(VERCEL, SAVED))).toBe(false);
    expect(await cronAuthorized(call(SAVED), sources(VERCEL, SAVED))).toBe(false);
    expect(await cronAuthorized(call(), sources(VERCEL, SAVED))).toBe(false);
  });

  it("refuses everything when neither is set, an empty bearer included", async () => {
    expect(await cronAuthorized(call("Bearer "), sources(undefined, undefined))).toBe(false);
    expect(await cronAuthorized(call("Bearer x"), sources("", ""))).toBe(false);
  });

  it("reads the store again for a key generated a moment ago on another server", async () => {
    expect(await cronAuthorized(call(`Bearer ${SAVED}`), sources(undefined, "older-key-0123456789abcdefghijklmn", SAVED))).toBe(true);
  });

  it("compares whole keys, never a prefix", () => {
    expect(keyMatches(SAVED.slice(0, 10), SAVED)).toBe(false);
    expect(keyMatches(`${SAVED}x`, SAVED)).toBe(false);
    expect(keyMatches(SAVED, ` ${SAVED} `)).toBe(true);
  });

  it("says whether the two agree, never either value", () => {
    expect(schedulerKeyWords(null, VERCEL)).toMatch(/^Scheduler key: not set here/);
    expect(schedulerKeyWords(SAVED, SAVED)).toBe("Scheduler key: saved here, and matches Vercel's.");
    expect(schedulerKeyWords(SAVED, VERCEL)).toContain("differs (fine");
    for (const words of [schedulerKeyWords(SAVED, VERCEL), schedulerKeyWords(null, VERCEL)]) {
      expect(words).not.toContain(SAVED);
      expect(words).not.toContain(VERCEL);
    }
  });
});
