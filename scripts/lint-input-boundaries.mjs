#!/usr/bin/env node
/**
 * Input boundary lint (SEC-03).
 *
 * Every untrusted-input boundary parses with a schema before use: route
 * handlers under apps/web/app/api (body, query, headers) and Server Actions
 * ('use server' files: FormData / arguments). This script inventories them,
 * classifies each, and fails when a handler that reads input has no
 * recognisable validation call and is not on the committed baseline
 * (`security/input-boundary-baseline.json`, each entry with a reason and the
 * story that burns it down).
 *
 *   node scripts/lint-input-boundaries.mjs              check (CI)
 *   node scripts/lint-input-boundaries.mjs --inventory  rewrite docs/security/input-boundary-inventory.json
 *
 * Classes: validated | partial | not-validated | no-input.
 * A baseline entry that no longer needs to be there is also an error, so the
 * list only ever shrinks.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const API_DIR = "apps/web/app/api";
const APP_DIR = "apps/web/app";
const BASELINE = "security/input-boundary-baseline.json";
const INVENTORY = "docs/security/input-boundary-inventory.json";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const BODY = /\.(?:json|formData|text|arrayBuffer|blob)\(\s*\)|\breadBody\w*\(|\breadRaw\w*\(/;
const QUERY = /\bparseQuery\(|\bsearchParams\b|\.nextUrl\b|\.search\b/;
const HEADER = /\bheaders\(\)|\.headers\.get\(|\bheaders\.get\(/;
const VALIDATION = /\.safeParse(?:Async)?\(|\.parse(?:Async)?\(|\binput:\s*\w|\bparse[A-Z]\w*\(|\bvalidate\w*\(|\bform(?:Uuid|Text)\(|\bread[A-Z]\w*(?:Envelope|Payload)\(|\bverify\w*(?:Signature|Webhook)\w*\(|\bz\.\w+\(/;

/** Split a module into its exported functions: [{ name, body }]. */
export function exportedFunctions(source, names) {
  const re = /export\s+(?:async\s+)?function\s+(\w+)\s*\(|export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function|defineRoute|\w+\(|\w+\s*;)/g;
  const starts = [];
  for (const m of source.matchAll(re)) {
    const name = m[1] ?? m[2];
    if (!names || names.includes(name)) starts.push({ name, at: m.index });
  }
  const all = [...source.matchAll(/\nexport\s/g)].map((m) => m.index);
  return starts.map(({ name, at }) => {
    const end = all.find((i) => i > at + 1) ?? source.length;
    return { name, body: source.slice(at, end), header: source.slice(at, source.indexOf("{", at) + 1) };
  });
}

/** Top-level helpers of the module, by name: a handler that calls one that validates is validated (one level deep). */
export function localHelpers(source) {
  const helpers = new Map();
  const re = /\n(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[<(]|\n(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>/g;
  const marks = [...source.matchAll(re)];
  const tops = [...source.matchAll(/\n(?=\S)/g)].map((m) => m.index);
  for (const m of marks) {
    const end = tops.find((i) => i > m.index + 1 && /^\n(?:export |async |function |const |type |interface |\/\*\*)/.test(source.slice(i, i + 14))) ?? source.length;
    helpers.set(m[1] ?? m[2], source.slice(m.index, end));
  }
  return helpers;
}

function callsValidatingHelper(body, helpers) {
  if (!helpers) return false;
  for (const [name, text] of helpers) {
    if (new RegExp(`\\b${name}\\s*[(<]`).test(body.slice(body.indexOf("{"))) && VALIDATION.test(text)) return true;
  }
  return false;
}

/** Classify one function body. */
export function classify(body, { action, helpers }) {
  const reads = [];
  if (BODY.test(body) || /\binput:\s*\w/.test(body)) reads.push("body");
  if (QUERY.test(body)) reads.push("query");
  // Headers are recorded but never required to be schema-parsed on their own:
  // they are compared against a secret or a signature, not used as data.
  if (HEADER.test(body)) reads.push("header");
  if (action) reads.length = 0;
  const validated = VALIDATION.test(body) || callsValidatingHelper(body, helpers);
  return { reads, validated };
}

export function analyzeRoute(file, source) {
  const helpers = localHelpers(source);
  return exportedFunctions(source, METHODS).map(({ name, body }) => {
    const { reads, validated } = classify(body, { action: false, helpers });
    let status;
    if (!reads.some((r) => r !== "header")) status = !/defineRoute/.test(body) && (/\b\w+\(\s*(?:request|req)\b/.test(body) || /=\s*\w*[hH]andle\w*\b/.test(body)) ? "delegated" : "no-input";
    else if (!validated) status = "not-validated";
    else if (reads.includes("query") && !/\bsearchParams[\s\S]{0,400}?(?:safeParse|parse\w*\()|(?:safeParse|parse\w*\()[\s\S]{0,200}?searchParams/.test(body) && !/\binput:\s*\w|\bparseQuery\(/.test(body)) status = "partial";
    else status = "validated";
    return { kind: "route", file, id: `${file}#${name}`, method: name, reads, status };
  });
}

export function analyzeActions(file, source) {
  if (!/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(source)) return [];
  const helpers = localHelpers(source);
  return exportedFunctions(source).map(({ name, body, header }) => {
    const hasParams = /\(\s*[^)\s]/.test(header);
    const { validated } = classify(body, { action: true, helpers });
    const status = !hasParams ? "no-input" : validated ? "validated" : "not-validated";
    return { kind: "action", file, id: `${file}#${name}`, method: name, reads: hasParams ? ["arguments"] : [], status };
  });
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

export function collect(root = ROOT) {
  const out = [];
  for (const full of walk(join(root, APP_DIR))) {
    const file = relative(root, full);
    if (!/\.tsx?$/.test(file) || /\.test\./.test(file)) continue;
    const source = readFileSync(full, "utf8");
    if (file.startsWith(`${API_DIR}/`) && /\/route\.ts$/.test(file)) out.push(...analyzeRoute(file, source));
    else out.push(...analyzeActions(file, source));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function tally(items) {
  const t = {};
  for (const kind of ["route", "action"]) {
    t[kind] = { total: 0, validated: 0, partial: 0, "not-validated": 0, "no-input": 0, delegated: 0 };
    for (const i of items.filter((x) => x.kind === kind)) {
      t[kind].total += 1;
      t[kind][i.status] += 1;
    }
  }
  return t;
}

/** Items that need a baseline entry: they read input and nothing validates it. */
export function violations(items, baseline) {
  const allowed = new Set(Object.keys(baseline));
  const flagged = items.filter((i) => i.status === "not-validated");
  const flaggedIds = new Set(flagged.map((i) => i.id));
  const problems = [];
  for (const i of flagged) {
    if (!allowed.has(i.id)) {
      problems.push(`${i.id}: reads ${i.reads.join("/")} with no schema parse — validate it with Zod (safeParse / defineRoute({ input })), or add it to ${BASELINE} with a reason and a story`);
    }
  }
  for (const [id, entry] of Object.entries(baseline)) {
    if (!entry?.reason || !entry?.story) problems.push(`${id}: baseline entry needs a "reason" and a "story"`);
    if (!flaggedIds.has(id)) problems.push(`${id}: baseline entry is stale (now validated or gone) — remove it from ${BASELINE}`);
  }
  return problems;
}

function main() {
  const items = collect();
  const baseline = JSON.parse(readFileSync(join(ROOT, BASELINE), "utf8")).entries;
  if (process.argv.includes("--inventory")) {
    writeFileSync(join(ROOT, INVENTORY), `${JSON.stringify({ generatedBy: "scripts/lint-input-boundaries.mjs --inventory", totals: tally(items), items }, null, 1)}\n`);
    console.log("Wrote", INVENTORY);
  }
  const problems = violations(items, baseline);
  const t = tally(items);
  if (problems.length > 0) {
    console.error("Input boundary lint failed:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`Input boundary lint passed: routes ${t.route.validated}/${t.route.total - t.route["no-input"]} validated, actions ${t.action.validated}/${t.action.total - t.action["no-input"]} validated, ${Object.keys(baseline).length} baselined.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main();
