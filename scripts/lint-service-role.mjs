#!/usr/bin/env node
/**
 * Service-role usage lint (SEC-04).
 *
 * The service-role client bypasses Row Level Security. New code reaches it only
 * through `adminClientFor(grant)` (packages/core/src/db/admin-context.ts), where
 * the authorization it relied on is a required argument. A raw
 * `createAdminClient()` call is allowed only in a file on the committed list
 * `security/service-role-baseline.json`, each entry with its class, a reason
 * and the number of raw call sites; the classes in LEGITIMATE are the
 * documented RLS-bypass set and stay, the rest are tranches still to wrap.
 *
 *   node scripts/lint-service-role.mjs              check (CI)
 *   node scripts/lint-service-role.mjs --inventory  rewrite docs/security/service-role-inventory.json
 *
 * Fails on: a raw call in a file not on the list; more raw calls than the entry
 * allows; a stale entry (fewer calls than listed, or none) — so the list only
 * shrinks; an entry with no class/reason/story.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const DIRS = ["apps", "packages"];
const BASELINE = "security/service-role-baseline.json";
const INVENTORY = "docs/security/service-role-inventory.json";
/** Where the client is defined and wrapped: not call sites. */
const DEFINITIONS = new Set(["packages/core/src/db/admin.ts", "packages/core/src/db/admin-context.ts"]);

/** The documented, permanent RLS-bypass set (docs/security/service-role.md). */
export const LEGITIMATE = {
  "audit-write": "Appends to the audit log, which members may read but never write.",
  "secret-read": "Reads or rotates a household secret that RLS deliberately hides from every member.",
  "signed-request": "Inbound webhook or token endpoint: no session exists; the sender's signature or shared secret is the authorization.",
  worker: "Scheduled or queued job authenticated by the worker secret; spans households by design.",
  "capability-token": "Public link carrying a single-purpose token (email-off, invitation); the token is the authorization.",
  "rate-limit": "Counts a request against a rate-limit bucket, a platform table no member can write.",
  "shared-repository": "Core repository whose callers authorize before calling; it never chooses the household itself.",
};
export const TRANCHE = { "household-scoped": "Signed-in member path: wrap with adminGrant.member/householdAdmin." };

/** Any use of the factory: a call, or the function handed on as a value. */
const RAW = /(?<!typeof\s+)\bcreateAdminClient\b/g;
const WRAPPED = /\badminClientFor\(/g;
const WRITES = /\.(?:insert|update|upsert|delete)\(|\.rpc\(|\.storage\b[\s\S]{0,80}?\.(?:upload|remove|move)\(|\.auth\.admin\./;

/** A first guess at the class from the path; the baseline holds the decision. */
export function guessClass(file) {
  if (/api\/audit\.ts$/.test(file)) return "audit-write";
  if (/ai\/(?:credentials|key-alerts)\.ts$|step-up-repository\.ts$|integrations\/smart-home|webhooks\//.test(file)) return "secret-read";
  if (/webhook|voice\/alexa|oauth\/voice\/token|partner\/|intake\/share|groceries\/order\/callback/.test(file)) return "signed-request";
  if (/portal-worker|api\/v1\/platform\/|notifications\/dispatch|subscriptions\/sync/.test(file)) return "worker";
  if (/careers\/actions\.ts$/.test(file)) return "rate-limit";
  if (/_lib\/careers\.ts$/.test(file)) return "secret-read";
  if (/email-off|\/e\/\[token\]/.test(file)) return "capability-token";
  if (/^packages\//.test(file)) return "shared-repository";
  return "household-scoped";
}

/** Blank out imports and comments, keeping line numbers. */
export function code(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^\s*\/\/.*$/gm, blank)
    .replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];?/gm, blank)
    .replace(/\{\s*createAdminClient\s*\}\s*=\s*await\s+import/g, blank);
}

export function analyze(file, text) {
  const source = code(text);
  const raw = [...source.matchAll(RAW)].map((m) => source.slice(0, m.index).split("\n").length);
  const wrapped = [...source.matchAll(WRAPPED)].length;
  return { file, raw: raw.length, lines: raw, wrapped, writes: WRITES.test(source), guess: guessClass(file) };
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "dist"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

export function collect(root = ROOT) {
  const out = [];
  for (const dir of DIRS) {
    for (const full of walk(join(root, dir))) {
      const file = relative(root, full);
      if (!/\.(?:ts|tsx|mjs)$/.test(file) || /\.test\.|\/e2e\//.test(file) || DEFINITIONS.has(file)) continue;
      const item = analyze(file, readFileSync(full, "utf8"));
      if (item.raw > 0 || item.wrapped > 0) out.push(item);
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function violations(items, baseline) {
  const classes = new Set([...Object.keys(LEGITIMATE), ...Object.keys(TRANCHE)]);
  const problems = [];
  const byFile = new Map(items.map((i) => [i.file, i]));
  for (const i of items.filter((x) => x.raw > 0)) {
    const entry = baseline[i.file];
    if (!entry) {
      problems.push(`${i.file}:${i.lines[0]}: raw createAdminClient() — use adminClientFor(adminGrant.…) from @wonderhome/core/db/admin-context, or add the file to ${BASELINE} with a class, reason and story`);
    } else if (i.raw > entry.sites) {
      problems.push(`${i.file}: ${i.raw} raw createAdminClient() calls, ${BASELINE} allows ${entry.sites} — wrap the new one with adminClientFor`);
    }
  }
  for (const [file, entry] of Object.entries(baseline)) {
    if (!classes.has(entry?.class)) problems.push(`${file}: baseline class must be one of ${[...classes].join(", ")}`);
    if (!entry?.reason || !entry?.story) problems.push(`${file}: baseline entry needs a "reason" and a "story"`);
    const raw = byFile.get(file)?.raw ?? 0;
    if (raw < (entry?.sites ?? 0)) problems.push(`${file}: baseline entry is stale (${raw} raw calls, lists ${entry.sites}) — lower or remove it in ${BASELINE}`);
  }
  return problems;
}

export function tally(items, baseline) {
  const t = { files: items.length, rawSites: 0, wrappedSites: 0, byClass: {} };
  for (const i of items) {
    t.rawSites += i.raw;
    t.wrappedSites += i.wrapped;
    if (i.raw === 0) continue;
    const cls = baseline[i.file]?.class ?? "unlisted";
    t.byClass[cls] = (t.byClass[cls] ?? 0) + i.raw;
  }
  return t;
}

function main() {
  const items = collect();
  const baseline = JSON.parse(readFileSync(join(ROOT, BASELINE), "utf8")).entries;
  if (process.argv.includes("--inventory")) {
    const rows = items.map((i) => ({ ...i, class: baseline[i.file]?.class ?? (i.raw ? "unlisted" : "wrapped") }));
    writeFileSync(join(ROOT, INVENTORY), `${JSON.stringify({ generatedBy: "scripts/lint-service-role.mjs --inventory", totals: tally(items, baseline), items: rows }, null, 1)}\n`);
    console.log("Wrote", INVENTORY);
  }
  const problems = violations(items, baseline);
  const t = tally(items, baseline);
  if (problems.length > 0) {
    console.error("Service-role lint failed:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`Service-role lint passed: ${t.wrappedSites} wrapped, ${t.rawSites} raw (${Object.entries(t.byClass).map(([k, v]) => `${k} ${v}`).join(", ")}).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main();
