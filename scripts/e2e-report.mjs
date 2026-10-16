#!/usr/bin/env node
/**
 * Reads a Playwright JSON report (PLAYWRIGHT_JSON_OUTPUT_FILE) and says what
 * happened in closed words, for the nightly E2E run (docs/CI.md).
 *
 *   node scripts/e2e-report.mjs summary <results.json> [part name]
 *     Markdown summary on stdout (appended to $GITHUB_STEP_SUMMARY when set).
 *     Exit 1 when anything failed or did not run.
 *
 *   node scripts/e2e-report.mjs timings <results.json> [more.json …]
 *     Seconds per spec file, as JSON — what e2e/timings.json holds and
 *     scripts/e2e-plan.mjs balances parts by.
 *
 * Outcomes:
 *   passed   — passed on its first attempt;
 *   flaky    — failed, then passed on a retry: a pass, but named, because a
 *              flaky test still needs a root cause;
 *   failed   — failed on every attempt;
 *   skipped  — skipped on purpose (test.skip / test.fixme);
 *   not run  — never finished: the part's time budget ran out, or it was
 *              interrupted. Counted against the run, never as a pass.
 */
import { appendFileSync, readFileSync } from "node:fs";

export const OUTCOMES = ["passed", "flaky", "failed", "skipped", "not run"];

function* tests(suite, file = suite.file) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests) yield { file: spec.file ?? file, title: spec.title, test };
  for (const child of suite.suites ?? []) yield* tests(child, child.file ?? file);
}

export function outcomeOf(test) {
  if (test.status === "expected") return "passed";
  if (test.status === "flaky") return "flaky";
  if (test.status === "unexpected") {
    const last = test.results.at(-1)?.status;
    return last === "interrupted" ? "not run" : "failed";
  }
  // "skipped": on purpose only when the test itself asked for it.
  const deliberate = (test.annotations ?? []).some((a) => a.type === "skip" || a.type === "fixme");
  return deliberate ? "skipped" : "not run";
}

export function summarize(report) {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  const named = { flaky: [], failed: [], "not run": [] };
  const seconds = {};
  for (const suite of report.suites ?? []) {
    for (const { file, title, test } of tests(suite)) {
      const outcome = outcomeOf(test);
      counts[outcome] += 1;
      if (named[outcome]) named[outcome].push(`${file} › ${title} [${test.projectName}]`);
      const spent = test.results.reduce((sum, r) => sum + (r.duration ?? 0), 0);
      seconds[file] = (seconds[file] ?? 0) + spent / 1000;
    }
  }
  const ok = counts.failed === 0 && counts["not run"] === 0 && (report.errors ?? []).length === 0;
  return { counts, named, seconds, ok, errors: (report.errors ?? []).map((e) => e.message ?? String(e)) };
}

export function markdown(summary, part = "E2E") {
  const { counts, named, ok, errors } = summary;
  const lines = [
    `### ${part}: ${ok ? "passed" : "FAILED"}`,
    "",
    "| passed | failed | flaky | skipped | not run |",
    "|---:|---:|---:|---:|---:|",
    `| ${counts.passed} | ${counts.failed} | ${counts.flaky} | ${counts.skipped} | ${counts["not run"]} |`,
  ];
  for (const outcome of ["failed", "flaky", "not run"]) {
    if (named[outcome].length === 0) continue;
    lines.push("", `**${outcome}${outcome === "flaky" ? " (passed only on retry — needs a root cause)" : ""}:**`);
    for (const name of named[outcome].slice(0, 50)) lines.push(`- ${name}`);
    if (named[outcome].length > 50) lines.push(`- …and ${named[outcome].length - 50} more`);
  }
  if (errors.length > 0) lines.push("", "**Run errors:**", ...errors.map((e) => `- ${e.split("\n")[0]}`));
  return `${lines.join("\n")}\n`;
}

const read = (path) => JSON.parse(readFileSync(path, "utf8"));

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , command, ...args] = process.argv;
  if (command === "summary" && args[0]) {
    let summary;
    try {
      summary = summarize(read(args[0]));
    } catch (error) {
      // No report at all means the run never got as far as writing one.
      summary = { counts: Object.fromEntries(OUTCOMES.map((o) => [o, 0])), named: { flaky: [], failed: [], "not run": [] }, seconds: {}, ok: false, errors: [`No readable report at ${args[0]}: ${error.message}`] };
    }
    const text = markdown(summary, args[1]);
    process.stdout.write(text);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
    for (const name of summary.named.flaky) console.log(`::warning title=Flaky E2E test::${name} passed only on retry`);
    process.exitCode = summary.ok ? 0 : 1;
  } else if (command === "timings" && args.length > 0) {
    const total = {};
    for (const path of args) for (const [file, s] of Object.entries(summarize(read(path)).seconds)) total[file] = (total[file] ?? 0) + s;
    const rounded = Object.fromEntries(Object.entries(total).sort(([a], [b]) => a.localeCompare(b)).map(([f, s]) => [f, Math.round(s * 10) / 10]));
    process.stdout.write(`${JSON.stringify(rounded, null, 2)}\n`);
  } else {
    console.error("Usage: node scripts/e2e-report.mjs summary <results.json> [part name]");
    console.error("       node scripts/e2e-report.mjs timings <results.json> [more.json …]");
    process.exitCode = 2;
  }
}
