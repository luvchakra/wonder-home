#!/usr/bin/env node
/**
 * PERF-17: the Supabase advisors (security + performance), against a baseline.
 *
 *   node scripts/advisor-gate.mjs            fail on any WARN/ERROR finding not in perf/advisor-baseline.json
 *   node scripts/advisor-gate.mjs --update   rewrite the baseline from the live results
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token) and optionally
 * SUPABASE_PROJECT_REF (default: the live project). Without the token it
 * SKIPS, exit 0, and says so: CI cannot use the MCP, and a fork or a fresh
 * repo has no secret. The token is only ever sent as a bearer header; it is
 * never printed. INFO findings (unused indexes) are counted and reported, not
 * gated: they depend on traffic. docs/performance-budgets.md.
 */
import { readFileSync, writeFileSync } from "node:fs";

const BASELINE_PATH = new URL("../perf/advisor-baseline.json", import.meta.url);
const REF = process.env.SUPABASE_PROJECT_REF || "kqxndableyysxqhxiorz";
const TYPES = ["security", "performance"];

/** A finding's identity: its lint plus its detail, minus quoting that differs between callers. */
export function keyOf(lint, finding) {
  let detail = String(finding.detail ?? "").replace(/[\\`]/g, "");
  // A function's argument list changes when it gains a parameter; that is the same finding.
  if (lint.name === "authenticated_security_definer_function_executable" || lint.name === "anon_security_definer_function_executable") detail = detail.split("(")[0];
  return `${lint.name}|${detail.trim()}`;
}

/** The lints in a Management API body: {lints}, {result:{lints}} or a bare array. */
export function lintsOf(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.lints)) return body.lints;
  if (Array.isArray(body?.result?.lints)) return body.result.lints;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

/** A grouped lint carries findings[]; a flat lint is itself the one finding (detail on the lint). */
const entriesOf = (lint) => (Array.isArray(lint.findings) ? lint.findings.map((f) => ({ ...f, detail: f.detail ?? lint.detail })) : [lint]);

export function summarize(lints) {
  const gated = {};
  const info = {};
  for (const lint of lints) {
    const entries = entriesOf(lint);
    if (lint.level === "INFO") info[lint.name] = (info[lint.name] ?? 0) + (Array.isArray(lint.findings) ? lint.findings.length || lint.count || 0 : 1);
    else (gated[lint.name] ??= []).push(...entries.map((f) => keyOf(lint, f)));
  }
  for (const name of Object.keys(gated)) gated[name] = [...new Set(gated[name])].sort();
  return { gated, info };
}

/** Why a 200 response parsed to nothing, without printing any of its content. */
export function describeUnparsed(type, body) {
  const keys = (v) => (v && typeof v === "object" ? Object.keys(v).join(", ") || "(none)" : typeof v);
  const first = lintsOf(body)[0];
  return `advisors/${type}: HTTP 200 but no lints parsed. Response top-level keys: ${Array.isArray(body) ? "(array)" : keys(body)}. First lint keys: ${first ? keys(first) : "(no lint)"}.`;
}

async function fetchLints(type, token) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${REF}/advisors/${type}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`advisors/${type}: HTTP ${response.status}`);
  const body = await response.json();
  return { type, body, lints: lintsOf(body).map((l) => ({ ...l, type })) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.log("SKIPPED: SUPABASE_ACCESS_TOKEN is not set, so the advisors were not checked.");
    console.log("Add it as a repository secret (a personal access token from supabase.com/dashboard/account/tokens) to activate this gate.");
    process.exit(0);
  }
  const fetched = await Promise.all(TYPES.map((t) => fetchLints(t, token)));
  const lints = fetched.flatMap((f) => f.lints);
  const now = summarize(lints);
  const baselineNow = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  // A 200 that parses to no lints at all, against a non-empty baseline, is a parser miss, not a clean project.
  if (!lints.length && Object.values(baselineNow.gated).flat().length) {
    for (const f of fetched) console.error(describeUnparsed(f.type, f.body));
    console.error("Refusing to pass vacuously: the baseline lists findings but none were parsed.");
    process.exit(1);
  }

  if (process.argv.includes("--update")) {
    const baseline = { _note: "Known WARN/ERROR advisor findings and INFO counts. Remove a finding when it is fixed; add one only with the reason in the PR. `npm run advisors -- --update` rewrites it.", project: REF, info: now.info, gated: now.gated };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote perf/advisor-baseline.json: ${Object.values(now.gated).flat().length} gated findings.`);
    process.exit(0);
  }

  const baseline = baselineNow;
  const known = new Set(Object.values(baseline.gated).flat());
  const fresh = Object.values(now.gated).flat().filter((k) => !known.has(k));
  const gone = [...known].filter((k) => !Object.values(now.gated).flat().includes(k));
  const infoShift = Object.entries(now.info).map(([n, c]) => `${n}: ${c} (baseline ${baseline.info[n] ?? 0})`);
  console.log(`Advisors: ${Object.values(now.gated).flat().length} known WARN findings; INFO — ${infoShift.join("; ") || "none"}.`);
  if (gone.length) console.log(`${gone.length} baseline finding(s) are fixed; remove them with --update:\n  ${gone.slice(0, 10).join("\n  ")}`);
  if (fresh.length) {
    console.error(`\n${fresh.length} NEW advisor finding(s) not in perf/advisor-baseline.json:`);
    for (const k of fresh) console.error(`  ${k}`);
    console.error("Fix the migration (an unindexed foreign key, an extra permissive policy, a callable SECURITY DEFINER function).");
    console.error("Accept one only deliberately: `npm run advisors -- --update`, with the reason in the PR. docs/performance-budgets.md.");
    process.exit(1);
  }
  console.log("No new advisor findings.");
}
