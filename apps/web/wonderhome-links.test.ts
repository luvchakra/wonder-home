import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * WonderHome keeps every link on its own site (owner, 2026-11-23: "don't depend on
 * WonderApps site, maintain all links on WonderHome own site"). wonderapps.biz is
 * disabled, so a link there is a dead end (the nightly footer test caught one).
 *
 * Fails when app code carries an address on wonderapps.biz other than WonderHome's own
 * host. Mail addresses (connect@…, support@…) and HomeSend's inbound mail domain are a
 * mail-domain question, not a website link, so they are not addresses here.
 */
const ROOT = join(__dirname, "../..");
const SCANNED = ["apps/web/app", "apps/web/public", "packages/core/src"];
const OWN_HOST = "home.wonderapps.biz";
/** Not a link anyone follows: the WonderJobs API the careers pages call from the server. */
const ALLOWED: Record<string, string[]> = {
  "packages/core/src/careers/wonderjobs.ts": ["jobs.wonderapps.biz"],
};
const ADDRESS = /(?:https?:\/\/|\bwww\.)((?:[a-z0-9-]+\.)*wonderapps\.biz)/gi;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === ".next" ? [] : files(path);
    if (/\.test\.tsx?$/.test(name)) return [];
    return /\.(tsx?|mjs|json|webmanifest|xml|txt|html|svg)$/.test(name) ? [path] : [];
  });
}

describe("every link stays on WonderHome's own site", () => {
  it("no app code links to wonderapps.biz outside home.wonderapps.biz", () => {
    const offenders: string[] = [];
    for (const dir of SCANNED) {
      for (const path of files(join(ROOT, dir))) {
        const file = relative(ROOT, path);
        for (const [, host] of readFileSync(path, "utf8").matchAll(ADDRESS)) {
          const lower = host.toLowerCase();
          if (lower === OWN_HOST || ALLOWED[file]?.includes(lower)) continue;
          offenders.push(`${file}: ${host}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("catches the shapes a company-site link takes", () => {
    const hosts = (text: string) => [...text.matchAll(ADDRESS)].map((match) => match[1]);
    expect(hosts('<a href="https://wonderapps.biz">')).toEqual(["wonderapps.biz"]);
    expect(hosts("see www.wonderapps.biz/about")).toEqual(["wonderapps.biz"]);
    expect(hosts("https://home.wonderapps.biz/help")).toEqual(["home.wonderapps.biz"]);
    expect(hosts("connect@wonderapps.biz")).toEqual([]);
  });
});
