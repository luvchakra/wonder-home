/**
 * Shared by the test-environment scripts (docs/test-environment.md).
 *
 * Every one of them works on the Supabase project `wonderhome-test` only and
 * refuses the production project outright, whatever it is told.
 *
 * SQL runs through `psql` with TEST_DATABASE_URL, the test project's own
 * connection string, a credential that reaches only the test database
 * (coordinator review, 2026-11-25: a personal access token reaches every
 * project on the account, production included, so it is not used here).
 * The usual place is GitHub Actions (`.github/workflows/test-env.yml`); a
 * Claude cloud container usually cannot reach port 5432. Never printed.
 */

import { execFileSync } from "node:child_process";

export const PRODUCTION_PROJECT_REFS = ["kqxndableyysxqhxiorz"];
export const TEST_HOST = "https://test.home.wonderapps.biz";
export const PRODUCTION_HOST = "https://home.wonderapps.biz";

/** The test project's ref: TEST_SUPABASE_PROJECT_REF, else the subdomain of TEST_SUPABASE_URL. */
export function testProjectRef(env = process.env) {
  const explicit = (env.TEST_SUPABASE_PROJECT_REF ?? "").trim();
  if (explicit) return explicit;
  const url = (env.TEST_SUPABASE_URL ?? "").trim();
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url);
  return match ? match[1] : null;
}

/** Throws unless a test project is named and it is not production. */
export function requireTestRef(env = process.env) {
  const ref = testProjectRef(env);
  if (!ref) throw new Error("Set TEST_SUPABASE_PROJECT_REF or TEST_SUPABASE_URL to the wonderhome-test project.");
  if (PRODUCTION_PROJECT_REFS.includes(ref)) throw new Error(`Refusing: ${ref} is the production project. These scripts only touch wonderhome-test.`);
  return ref;
}

/**
 * The test database's connection string, checked to be the test project's:
 * a Supabase string names its project (`postgres.<ref>@…pooler…` or
 * `db.<ref>.supabase.co`), and production's is refused.
 */
export function requireDatabaseUrl(env = process.env) {
  const url = (env.TEST_DATABASE_URL ?? "").trim();
  if (!url) throw new Error("Set TEST_DATABASE_URL (the wonderhome-test project's Session pooler connection string).");
  if (PRODUCTION_PROJECT_REFS.some((ref) => url.includes(ref))) throw new Error("Refusing: TEST_DATABASE_URL points at the production project.");
  const ref = testProjectRef(env);
  if (ref && !url.includes(ref)) throw new Error(`Refusing: TEST_DATABASE_URL does not name the test project ${ref}.`);
  return url;
}

function psql(url, args, input) {
  try {
    return execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...args, url], { input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (error) {
    const message = String(error.stderr ?? error.message).replaceAll(url, "<TEST_DATABASE_URL>");
    throw new Error(message.trim().slice(0, 2000));
  }
}

/** Runs SQL (any number of statements) on the test database. */
export function exec(url, sql) {
  psql(url, ["-f", "-"], sql);
}

/** Rows of one SELECT, as objects. */
export function rows(url, select) {
  const out = psql(url, ["-At", "-c", `select coalesce(json_agg(t), '[]'::json) from (${select}) t`]);
  return JSON.parse(out.trim() || "[]");
}

/** SQL string literal. */
export function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
