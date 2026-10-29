import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { HANDLER_CACHE_EXCEPTIONS, handlerKeepsOwnCacheHeader, isNonShared, responseCacheHeaders } from "@wonderhome/core/security/cache-policy";
import { routeRequirement } from "@wonderhome/core/security/route-policy";

import { config } from "./middleware";

/**
 * The standing gate for the caching strategy (docs/progress/2026-10-29-caching-strategy.md):
 * every page and route handler the app has, walked from the file system, is answered with a
 * header no shared cache may store — or is one of the few listed exceptions, whose own header
 * is checked here too.
 */

const APP = join(__dirname, "app");
const ENTRY = /^(page\.tsx|route\.tsx?|opengraph-image\.tsx)$/;

function entries(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return entries(path);
    return ENTRY.test(name) ? [path] : [];
  });
}

/** An address the file answers: groups dropped, each [param] filled in. */
function addressOf(file: string): string {
  const parts = relative(APP, file).split(sep).slice(0, -1).filter((part) => !/^\(.*\)$/.test(part));
  const filled = parts.map((part) => part.replace(/^\[\[?\.{0,3}(.+?)\]?\]$/, "$1-1"));
  const base = `/${filled.join("/")}`.replace(/\/$/, "") || "/";
  return file.endsWith("opengraph-image.tsx") ? `${base === "/" ? "" : base}/opengraph-image` : base;
}

const runs = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
const routes = entries(APP).map((file) => ({ file, path: addressOf(file) }));

describe("no shared cache ever keeps a page or API answer", () => {
  it("finds the app's routes", () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.map((route) => route.path)).toEqual(expect.arrayContaining(["/", "/today", "/meals", "/groceries", "/api/v1/me"]));
  });

  it("puts private, no-store on every route the middleware sees", () => {
    const unguarded: string[] = [];
    for (const { path } of routes) {
      if (!runs(path)) continue;
      if (handlerKeepsOwnCacheHeader(path)) continue;
      const header = responseCacheHeaders(path).find(({ key }) => key === "Cache-Control")?.value;
      if (!isNonShared(header) || !header?.includes("no-store")) unguarded.push(`${path} (${routeRequirement(path)})`);
    }
    expect(unguarded).toEqual([]);
  });

  it("lets only cookie-free webhooks and cron calls skip the middleware", () => {
    const skipped = routes.filter(({ path }) => !runs(path)).map(({ path }) => path);
    for (const path of skipped) expect(path, path).toMatch(/^\/api\/v1\/(whatsapp\/webhook|billing\/webhook|homesend\/email\/webhook|platform\/webhook-delivery)(\/|$)/);
  });

  it("holds each exception to the header its reason promises", () => {
    const invitation = readFileSync(join(APP, "e", "[token]", "render-invitation.tsx"), "utf8");
    for (const { pattern, why } of HANDLER_CACHE_EXCEPTIONS) {
      const owned = routes.filter(({ path }) => pattern.test(path));
      expect(owned.length, String(pattern)).toBeGreaterThan(0);
      const promised = /\((public|private)[^)]*\)/.exec(why)?.[1];
      for (const { file, path } of owned) {
        // A signed-in route may only ever say private.
        if (routeRequirement(path) !== "public") expect(promised, path).toBe("private");
        const source = readFileSync(file, "utf8") + (path.startsWith("/e/") ? invitation : "");
        expect(source, path).toMatch(new RegExp(`cache-control"\\s*:\\s*[^\\n]*"${promised}, max-age=\\d+`, "i"));
        if (promised === "private") expect(source, path).not.toMatch(/s-maxage|"public/);
      }
    }
  });
});
