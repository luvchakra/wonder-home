import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PLATFORM_DATA, forgetPlatformData, keptPerServer, type PlatformDataKey } from "./platform-cache";

afterEach(() => forgetPlatformData("plan_catalog"));

describe("keptPerServer", () => {
  it("reads once within the TTL and again after it", async () => {
    const load = vi.fn(async () => ({ value: [1, 2], keep: true }));
    expect(await keptPerServer("plan_catalog", load, 1_000)).toEqual([1, 2]);
    expect(await keptPerServer("plan_catalog", load, 1_000 + PLATFORM_DATA.plan_catalog.ttlMs - 1)).toEqual([1, 2]);
    expect(load).toHaveBeenCalledTimes(1);
    await keptPerServer("plan_catalog", load, 1_000 + PLATFORM_DATA.plan_catalog.ttlMs);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one read between concurrent callers", async () => {
    const load = vi.fn(async () => ({ value: "rows", keep: true }));
    await Promise.all([keptPerServer("plan_catalog", load), keptPerServer("plan_catalog", load), keptPerServer("plan_catalog", load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never keeps a failed or partial read", async () => {
    await expect(keptPerServer("plan_catalog", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    const partial = vi.fn(async () => ({ value: [], keep: false }));
    await keptPerServer("plan_catalog", partial);
    await Promise.resolve();
    await keptPerServer("plan_catalog", partial);
    expect(partial).toHaveBeenCalledTimes(2);
  });

  it("forgets on a change", async () => {
    const load = vi.fn(async () => ({ value: 1, keep: true }));
    await keptPerServer("plan_catalog", load);
    forgetPlatformData("plan_catalog");
    await keptPerServer("plan_catalog", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("refuses any key that is not listed platform data", async () => {
    await expect(keptPerServer("household:h1" as PlatformDataKey, async () => ({ value: 1, keep: true }))).rejects.toThrow("not platform data");
  });
});

/**
 * The proof a kept entry cannot be household-scoped: every table behind a key
 * reads the same for every caller. Each read policy on it (in any migration,
 * created or altered) must name no household, member, profile or user.
 */
describe("only caller-independent tables are kept", () => {
  const migrations = join(__dirname, "../../../../supabase/migrations");
  const sql = readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrations, name), "utf8").replace(/--[^\n]*/g, ""))
    .join("\n");
  const statements = sql.split(";");

  for (const [key, { tables }] of Object.entries(PLATFORM_DATA)) {
    for (const table of tables) {
      it(`${key}: ${table}`, () => {
        const policies = statements.filter((statement) => new RegExp(`\\bpolicy\\b[\\s\\S]*\\bon\\s+public\\.${table}\\b`, "i").test(statement));
        const reads = policies.filter((statement) => !/\bfor\s+(insert|update|delete)\b/i.test(statement) && !/^\s*drop\s+policy/i.test(statement));
        expect(reads.length, `${table} has a read policy`).toBeGreaterThan(0);
        for (const policy of reads) {
          expect(policy, policy).toMatch(/\bto\s+authenticated\b/i);
          expect(policy, policy).not.toMatch(/auth\.|wh\.|household|member|profile|current_user|session_user|request\.jwt/i);
        }
        // Row-level security stays on, so the policy above is the whole answer.
        expect(sql).toMatch(new RegExp(`alter\\s+table\\s+(public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
      });
    }
  }
});
