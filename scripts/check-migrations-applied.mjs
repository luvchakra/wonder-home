#!/usr/bin/env node
/**
 * Migration-drift guard: repo migration files that the live project's
 * migration history does not know.
 *
 *   node scripts/check-migrations-applied.mjs            list drift; exit 1 if any
 *   node scripts/check-migrations-applied.mjs --report   list drift; always exit 0
 *
 * Reads supabase_migrations.schema_migrations through the Supabase management
 * API (read-only SELECT) with SUPABASE_ACCESS_TOKEN, the secret the advisor
 * gate uses, and optionally SUPABASE_PROJECT_REF (default: the live project).
 * Without the token it SKIPS (exit 0) and says so. Files are matched by base
 * name (the part after the timestamp): applying through the MCP stamps its own
 * version, so the version number differs from the file's. The token is only
 * sent as a bearer header and never printed. docs/migration-history.md.
 */
import { readdirSync } from "node:fs";

const REF = process.env.SUPABASE_PROJECT_REF || "kqxndableyysxqhxiorz";
const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url);

/** `20261020200000_food_preferences_diet` and `food_preferences_diet` are the same migration. */
export function baseName(name) {
  return String(name).replace(/\.sql$/, "").replace(/^\d{14}_/, "");
}

/** Repo files (without .sql) whose base name is not among the live history names. */
export function missingFromHistory(files, historyNames) {
  const known = new Set(historyNames.map(baseName));
  return files.filter((f) => !known.has(baseName(f))).sort();
}

async function liveNames(token) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select name from supabase_migrations.schema_migrations" }),
  });
  if (!response.ok) throw new Error(`database/query: HTTP ${response.status}`);
  const rows = await response.json();
  return rows.map((r) => r.name).filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.log("SKIPPED: SUPABASE_ACCESS_TOKEN is not set, so migration history was not checked.");
    console.log("Add it as a repository secret (a personal access token from supabase.com/dashboard/account/tokens) to activate this check.");
    process.exit(0);
  }
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, ""));
  const missing = missingFromHistory(files, await liveNames(token));
  if (missing.length === 0) {
    console.log(`OK: all ${files.length} repo migrations are in the live history.`);
    process.exit(0);
  }
  console.log(`${missing.length} repo migration(s) have no row in the live supabase_migrations.schema_migrations:`);
  for (const m of missing) console.log(`  ${m}`);
  console.log("Not applied: apply it (CLAUDE.md, 'Applying a migration to the live project'). Applied by SQL but unrecorded: insert the history rows (docs/migration-history.md).");
  process.exit(process.argv.includes("--report") ? 0 : 1);
}
