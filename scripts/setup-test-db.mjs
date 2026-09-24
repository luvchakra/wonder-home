#!/usr/bin/env node
/**
 * Builds a throwaway database from the committed migrations.
 *
 * Applying the real migration files (rather than a hand-maintained schema
 * dump) means these tests fail if a migration would fail, and the RLS policies
 * under test are the ones that actually ship.
 *
 * The migrations are applied once, into a template database named after a
 * hash of every migration and the shim, and each test file's database is a
 * copy of it (`create database … template …`, a file copy rather than a
 * replay). Replaying 85+ migrations per file was most of what the database
 * suite spent its time on. A changed migration changes the hash, so a stale
 * template is never reused; older templates are dropped when a new one is
 * built.
 *
 * `npm run test:db` builds the template first (`--template`), so the files
 * that start together never race to build it; a single file run on its own
 * builds it on demand.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SHIM = join(ROOT, "supabase/tests/supabase-shim.sql");

function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MIGRATIONS, f));
}

/** The template's name: a hash of exactly what it was built from. */
function templateName() {
  const hash = createHash("sha256");
  for (const file of [SHIM, ...migrationFiles()]) {
    hash.update(file.slice(ROOT.length)).update("\0").update(readFileSync(file)).update("\0");
  }
  return `wh_tpl_${hash.digest("hex").slice(0, 16)}`;
}

export function buildTestDatabase(database) {
  const template = ensureTemplate();
  run("postgres", `drop database if exists ${database}`);
  createFrom(database, template);
  return database;
}

/** Builds the template if it does not exist yet, and returns its name. */
export function ensureTemplate() {
  const template = templateName();
  if (exists(template)) return template;

  // Built under a private name and renamed into place, so a concurrent
  // builder never sees (or copies) a half-migrated template.
  const building = `${template}_b${process.pid}`;
  run("postgres", `drop database if exists ${building}`);
  run("postgres", `create database ${building}`);
  apply(building, SHIM);
  for (const file of migrationFiles()) apply(building, file);

  try {
    run("postgres", `alter database ${building} rename to ${template}`);
  } catch (error) {
    // Another process finished first: theirs is identical, so use it.
    run("postgres", `drop database if exists ${building}`);
    if (!exists(template)) throw error;
  }

  // Templates built from an older set of migrations are never used again.
  for (const stale of query("postgres", `select datname from pg_database where datname like 'wh\\_tpl\\_%' and datname <> '${template}' and datname not like '%\\_b%'`)) {
    try {
      run("postgres", `drop database if exists ${stale}`);
    } catch {
      // In use by a concurrent run on an older checkout; left for next time.
    }
  }
  return template;
}

function createFrom(database, template) {
  // Postgres refuses to copy a template another session is copying at the
  // same instant ("source database is being accessed by other users"), so a
  // few files starting together retry briefly.
  for (let attempt = 0; ; attempt += 1) {
    try {
      run("postgres", `create database ${database} template ${template}`);
      return;
    } catch (error) {
      if (attempt >= 20 || !String(error.stderr ?? error).includes("being accessed by other users")) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 + Math.floor(Math.random() * 200));
    }
  }
}

function exists(database) {
  return query("postgres", `select 1 from pg_database where datname = '${database}'`).length > 0;
}

function query(database, sql) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-qAt", "-d", database, "-c", sql], {
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString()
    .split("\n")
    .filter(Boolean);
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
  if (process.argv[2] === "--template") {
    console.log(`Template ${ensureTemplate()} is ready (${migrationFiles().length} migrations).`);
  } else {
    const database = process.argv[2] ?? "wonderhome_test";
    buildTestDatabase(database);
    console.log(`Built ${database} from ${migrationFiles().length} migrations.`);
  }
}
