#!/usr/bin/env node
/**
 * PERF-16: first-load JavaScript per route, against a committed budget.
 *
 *   node scripts/bundle-budget.mjs [.next dir]            check perf/bundle-budget.json
 *   node scripts/bundle-budget.mjs [.next dir] --update   re-measure and rewrite it
 *
 * Runs after `next build` (no second build). Turbopack's build prints no
 * sizes, so they are read from the build itself: a route's first load is the
 * gzip size of every distinct client chunk its page, layouts and the root
 * bundle reference (`entryJSFiles` in the route's client-reference manifest,
 * plus `rootMainFiles` in build-manifest.json). Sizes depend on content, not
 * on chunk names, so they repeat between builds of the same source.
 *
 * Cap = measured + 5% (at least +2 KB, so a small route is not brittle). A
 * route with no entry yet is held to `newRouteCapGz`, the largest budget
 * plus 5%. The content checks stay in check-client-bundle.mjs.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BUDGET_PATH = join(ROOT, "perf/bundle-budget.json");
const args = process.argv.slice(2);
const update = args.includes("--update");
const nextDir = args.find((a) => !a.startsWith("--")) ?? join(ROOT, "apps/web/.next");

const cap = (bytes) => Math.ceil(Math.max(bytes * 1.05, bytes + 2048) / 100) * 100;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const gzSizes = new Map();
function gz(file) {
  if (!gzSizes.has(file)) gzSizes.set(file, gzipSync(readFileSync(join(nextDir, file)), { level: 9 }).length);
  return gzSizes.get(file);
}
const total = (files) => [...files].reduce((sum, f) => sum + gz(f), 0);

function* manifests(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* manifests(path);
    else if (entry === "page_client-reference-manifest.js") yield path;
  }
}

/** { route -> Set of client chunk files } for every page in the build. */
export function routeChunks(nextDir) {
  const root = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8")).rootMainFiles ?? [];
  const appDir = join(nextDir, "server/app");
  const routes = new Map();
  for (const path of manifests(appDir)) {
    const text = readFileSync(path, "utf8");
    const entry = text.match(/"entryJSFiles":(\{[^{}]*\})/)?.[1];
    if (!entry) continue;
    const files = new Set(root);
    for (const list of Object.values(JSON.parse(entry))) for (const f of list) files.add(f);
    const route = `/${relative(appDir, path).replace(/\/?page_client-reference-manifest\.js$/, "")}`.replace(/\/$/, "") || "/";
    routes.set(route, [...files].filter((f) => f.endsWith(".js")));
  }
  return routes;
}

const routes = routeChunks(nextDir);
if (routes.size < 20) {
  console.error(`Only ${routes.size} routes found under ${nextDir}; the budget would prove nothing. Run \`npm run build\` first.`);
  process.exit(1);
}
const sizes = Object.fromEntries([...routes].map(([route, files]) => [route, total(files)]).sort());
const shared = [...routes.values()].reduce((common, files) => common.filter((f) => files.includes(f)));
const sharedGz = total(shared);

if (update) {
  const budget = {
    _note: "Gzip bytes of first-load JS. Cap = measured +5% (min +2 KB). Raise one only in a PR that says why: `npm run budget:bundle -- --update`.",
    sharedCapGz: cap(sharedGz),
    newRouteCapGz: cap(Math.max(...Object.values(sizes))),
    routes: Object.fromEntries(Object.entries(sizes).map(([route, bytes]) => [route, cap(bytes)])),
  };
  writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`Wrote perf/bundle-budget.json: ${routes.size} routes, shared ${kb(sharedGz)}, largest ${kb(Math.max(...Object.values(sizes)))}.`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
const offenders = [];
if (sharedGz > budget.sharedCapGz) offenders.push({ route: "(shared by every route)", size: sharedGz, cap: budget.sharedCapGz });
for (const [route, size] of Object.entries(sizes)) {
  const limit = budget.routes[route] ?? budget.newRouteCapGz;
  if (size > limit) offenders.push({ route: budget.routes[route] ? route : `${route} (new)`, size, cap: limit });
}
const stale = Object.keys(budget.routes).filter((r) => !(r in sizes));

console.log(`First-load JS (gzip): ${routes.size} routes, shared ${kb(sharedGz)} of ${kb(budget.sharedCapGz)}, largest ${kb(Math.max(...Object.values(sizes)))}.`);
if (stale.length) console.log(`Budgeted routes no longer built (drop with --update): ${stale.join(", ")}`);
if (offenders.length) {
  console.error("\nFirst-load JS over budget:");
  console.table(offenders.map((o) => ({ route: o.route, size: kb(o.size), cap: kb(o.cap), over: kb(o.size - o.cap) })));
  console.error("Find the import that grew (a client component pulling in a server-sized library), or load it on demand.");
  console.error("If the growth is intended, run `npm run budget:bundle -- --update` and say why in the PR: docs/performance-budgets.md.");
  process.exit(1);
}
console.log("Every route is within its first-load budget.");
