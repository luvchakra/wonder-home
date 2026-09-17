#!/usr/bin/env node
/**
 * Secret handling lint (story 15-004).
 *
 * The security baseline says credentials never appear in source, client bundles
 * or logs. Two of those three can be checked mechanically, so they are:
 *
 *   1. No credential-shaped literal is committed.
 *   2. No server-only secret is exposed to the browser — anything named
 *      NEXT_PUBLIC_ is inlined into the client bundle by definition, so a
 *      service-role key behind that prefix is a leak, not a configuration
 *      choice.
 *
 * Tests that exercise redaction need credential-shaped fixtures, so a file may
 * opt out with an explicit `lint-secrets: fixtures` marker. That is deliberate:
 * the exemption is a visible line in a diff someone has to add on purpose,
 * rather than a filename convention a real key could hide behind.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
]);
const SCANNED = /\.(ts|tsx|mts|js|jsx|mjs|json|sql|md|ya?ml|env|example)$|^\.env/;

/** Credential shapes worth failing a build over. */
const SECRET_PATTERNS = [
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{8,}/ },
  { name: "JWT with a payload", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Postgres connection string with credentials", re: /\bpostgres(?:ql)?:\/\/[^\s"':]+:[^\s"'@]+@/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: "OpenAI API key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

/** Server-only names that must never be exposed to the browser. */
const SERVER_ONLY = /NEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PRIVATE|PASSWORD)/;

/** Values that announce themselves as fake. Matched against the credential, not the line. */
const PLACEHOLDER = /placeholder|example|redacted|your[-_]?key|changeme|xxx+/i;

/** An explicit, reviewable opt-out for files that need fake credentials. */
const FIXTURE_MARKER = /lint-secrets:\s*fixtures/;

export function lintSecretSource(file, source) {
  const problems = [];
  if (FIXTURE_MARKER.test(source)) return problems;

  for (const line of source.split("\n")) {
    for (const { name, re } of SECRET_PATTERNS) {
      const match = re.exec(line);
      // Judge the matched value itself, not the line around it: a line that
      // merely mentions "example" should not excuse a real key sitting on it.
      if (match && !PLACEHOLDER.test(match[0])) {
        problems.push(`${file}: looks like a committed ${name}`);
      }
    }
    if (SERVER_ONLY.test(line)) {
      problems.push(
        `${file}: a server-only value is behind NEXT_PUBLIC_, which ships it to the browser`,
      );
    }
  }

  return problems;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SCANNED.test(entry)) yield full;
  }
}

function main() {
  const problems = [];
  let checked = 0;

  for (const full of walk(ROOT)) {
    checked += 1;
    const file = relative(ROOT, full);
    // The lint's own pattern list is not a finding.
    if (file === "scripts/lint-secrets.mjs") continue;
    problems.push(...lintSecretSource(file, readFileSync(full, "utf8")));
  }

  if (problems.length > 0) {
    console.error("Secret lint failed:");
    for (const problem of [...new Set(problems)]) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`Secret lint passed (${checked} files).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
