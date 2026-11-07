#!/usr/bin/env node
/**
 * WonderHome's background jobs on the GitHub Actions runner
 * (.github/workflows/background-jobs.yml): runs the app's own core code
 * (packages/core/src/jobs/runner.ts) in this process, against Supabase, with
 * the repository's secrets as its environment. The site is never called.
 * Loads the TypeScript through jiti, like scripts/eval.mjs.
 *
 *   node scripts/jobs.mjs <clock|calendar-sync|webhooks|daily> [--dry-run]
 *
 *   --dry-run   load the code, check the environment and the database, and
 *               print what would run; nothing is claimed, written or sent.
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (required); WONDERHOME_AI_KEY (+ WONDERHOME_AI_PROVIDER / _MODEL) for the
 * HomeSend tidy and HomeBrain Sleep steps, which are left to Vercel without it.
 * Prints counts only — never an id, a title or a household.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const job = args.find((arg) => !arg.startsWith("--"));

const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}. On GitHub these are repository secrets (see .github/workflows/background-jobs.yml).`);
  process.exit(2);
}
// The service-role client never uses the publishable key, but the shared env check asks for one.
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= "unused-by-service-role-background-jobs";

const jiti = createJiti(import.meta.url);
const { JOBS, isJobName, runJob } = await jiti.import(join(root, "packages/core/src/jobs/runner.ts"));
if (!job || !isJobName(job)) {
  console.error(`Usage: node scripts/jobs.mjs <${Object.keys(JOBS).join("|")}> [--dry-run]`);
  process.exit(2);
}
const { adminClientFor, adminGrant } = await jiti.import(join(root, "packages/core/src/db/admin-context.ts"));
const admin = adminClientFor(adminGrant.worker(`background-jobs:${job}`, "platform background jobs on the GitHub runner, every household"));

if (dryRun) {
  // Read-only: proves the URL and key reach the database (a count, nothing else).
  const { error } = await admin.from("households").select("id", { count: "exact", head: true });
  if (error) {
    console.error(`database not reachable: ${error.code || error.message || "unknown"}`);
    process.exit(1);
  }
  console.log("database reachable");
}

const runUrl = (() => {
  const { GITHUB_SERVER_URL: host, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = process.env;
  return host && repo && /^\d+$/.test(id ?? "") ? `${host}/${repo}/actions/runs/${id}` : undefined;
})();

const started = Date.now();
try {
  const result = await runJob(admin, job, { dryRun, runUrl, runner: process.env.GITHUB_ACTIONS === "true" ? "github" : "manual" });
  for (const step of result.steps) {
    const detail = step.summary ? JSON.stringify(step.summary) : step.reason ?? "";
    console.log(`${step.state.padEnd(14)} ${step.step}  ${detail}`);
  }
  console.log(`${job}: ${result.ok ? "ok" : "failed"} in ${Math.round((Date.now() - started) / 1000)} s${dryRun ? " (dry run)" : ""}`);
  process.exit(result.ok ? 0 : 1);
} catch (thrown) {
  console.error(`${job} failed: ${thrown instanceof Error ? thrown.name : "error"}`);
  process.exit(1);
}
