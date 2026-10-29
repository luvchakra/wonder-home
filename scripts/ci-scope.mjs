#!/usr/bin/env node
/**
 * What a CI run must check, from what the change touches (docs/CI.md).
 *
 *   node scripts/ci-scope.mjs <event> [base-sha]
 *
 * Writes to $GITHUB_OUTPUT (and prints):
 *   full         — run every unit test and lint the whole app: a push to
 *                  main, or a pull request touching dependencies, TypeScript,
 *                  test, lint or build config, or CI itself;
 *   code         — anything outside the docs trees;
 *   unit         — anything a unit test could see;
 *   db           — migrations or the database test scripts;
 *   web          — anything the Next.js build reads;
 *   lint_files   — changed app files for ESLint, relative to apps/web;
 *   test_files   — changed packages/core files for `vitest related`,
 *                  relative to packages/core;
 *   script_tests — scripts/ changed, so its node:test suite runs.
 *
 * A pull request that only deletes a packages/core source file runs every
 * unit test: `vitest related` cannot follow an import to a file that is gone.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";

const DOCS = /^(docs|backlogs|tracking|design|architecture|database)\/|\.md$/;

/** Changing any of these can change how every test or lint behaves. */
export const FULL_RUN = [
  /^\.github\//,
  /(^|\/)package\.json$/,
  /^package-lock\.json$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vitest\.(config|setup|workspace)[^/]*$/,
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /(^|\/)next\.config\.[cm]?[jt]s$/,
  /(^|\/)postcss\.config\.[cm]?[jt]s$/,
  /^playwright\.config\.ts$/,
  /^vercel\.json$/,
  /^scripts\/ci-scope\.mjs$/,
];

const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export function scope(event, changed, exists = existsSync) {
  if (event !== "pull_request") {
    return { full: true, code: true, unit: true, db: true, web: true, lint_files: "", test_files: "", script_tests: true };
  }
  const any = (re, unless) => changed.some((f) => re.test(f) && !(unless && unless.test(f)));
  const coreSource = changed.filter((f) => f.startsWith("packages/core/"));
  const full = changed.some((f) => FULL_RUN.some((re) => re.test(f))) || coreSource.some((f) => !exists(f));
  const code = any(/./, DOCS);
  return {
    full,
    code,
    unit: full || any(/^(apps|packages|scripts)\//),
    db: full || any(/^supabase\/|^perf\/(queries\.mjs|query-budget\.json)$|^scripts\/(test-.*-rls\.mjs|setup-test-db\.mjs|perf-query-budget\.mjs|lib\/)/),
    web: full || any(/^(apps|packages)\//, /^perf\/bundle-budget\.json$|^scripts\/bundle-budget\.mjs$/, /\.test\.tsx?$|\.md$/),
    lint_files: changed
      .filter((f) => f.startsWith("apps/web/") && LINTED.test(f) && exists(f))
      .map((f) => f.slice("apps/web/".length))
      .join(" "),
    test_files: coreSource.filter((f) => exists(f)).map((f) => f.slice("packages/core/".length)).join(" "),
    script_tests: full || any(/^scripts\//),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , event, base] = process.argv;
  const changed =
    event === "pull_request"
      ? execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8" }).split("\n").filter(Boolean)
      : [];
  if (changed.length > 0) console.log(`Changed files:\n${changed.join("\n")}\n`);
  const result = scope(event, changed);
  const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}
