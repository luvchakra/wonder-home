#!/usr/bin/env node
/**
 * Builds a throwaway database from the committed migrations.
 *
 * Applying the real migration files (rather than a hand-maintained schema
 * dump) means these tests fail if a migration would fail, and the RLS policies
 * under test are the ones that actually ship.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SHIM = join(ROOT, "supabase/tests/supabase-shim.sql");

export function buildTestDatabase(database) {
  run("postgres", `drop database if exists ${database}`);
  run("postgres", `create database ${database}`);

  apply(database, SHIM);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    apply(database, join(MIGRATIONS, file));
  }
  return database;
}

function run(database, sql) {
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", database, "-c", sql], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function apply(database, file) {
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", database, "-f", file], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const database = process.argv[2] ?? "wonderhome_test";
  buildTestDatabase(database);
  console.log(`Built ${database} from ${readdirSync(MIGRATIONS).length} migrations.`);
}
