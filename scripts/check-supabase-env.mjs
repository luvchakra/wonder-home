#!/usr/bin/env node
/**
 * Preflight check: refuse to build or run WonderHome against any Supabase
 * project other than the pinned one.
 *
 * Runs automatically before `npm run build` and `npm run dev`. Set
 * SKIP_ENV_VALIDATION=1 to bypass it in contexts with no Supabase env at all
 * (a lint-only CI job, for example).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Read the pinned ref from the TypeScript module so there is one source of truth. */
function pinnedRef() {
  const source = readFileSync(join(root, "src/lib/supabase/project.ts"), "utf8");
  const match = /WONDERHOME_PROJECT_REF = "([a-z]+)"/.exec(source);
  if (!match) {
    throw new Error(
      "Could not read WONDERHOME_PROJECT_REF from src/lib/supabase/project.ts",
    );
  }
  return match[1];
}

/** Load .env files into process.env without clobbering real environment values. */
function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      if (key in process.env) continue;

      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

const REF = pinnedRef();
const HOST_RE = /^(?:db\.)?([a-z]{20})\.supabase\.(?:co|in|red)$/;
const errors = [];
const warnings = [];

function refFromHost(host) {
  const match = HOST_RE.exec(host);
  return match ? match[1] : null;
}

function refFromKey(key) {
  const segments = key.split(".");
  if (segments.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")).ref ?? null;
  } catch {
    return null;
  }
}

function checkUrlVar(name, { required }) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (required) errors.push(`${name} is not set (see .env.example).`);
    return;
  }

  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    errors.push(`${name} is not a valid URL.`);
    return;
  }

  const ref = refFromHost(host);
  if (ref !== REF) {
    errors.push(
      `${name} points at ${ref ? `project "${ref}"` : `host "${host}"`}, not the WonderHome project "${REF}".`,
    );
  }
}

function checkKeyVar(name, { required }) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (required) errors.push(`${name} is not set (see .env.example).`);
    else warnings.push(`${name} is not set — features that need it will fail.`);
    return;
  }

  const ref = refFromKey(value);
  if (ref !== null && ref !== REF) {
    errors.push(`${name} is a key for project "${ref}", not "${REF}".`);
  }
}

/** Postgres connection strings: direct host, or pooler with `postgres.<ref>` as the user. */
function checkPostgresVar(name) {
  const value = process.env[name]?.trim();
  if (!value) return;

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${name} is not a valid Postgres connection string.`);
    return;
  }

  const hostRef = refFromHost(url.hostname);
  const userRef = /^postgres\.([a-z]{20})$/.exec(
    decodeURIComponent(url.username),
  )?.[1];
  const ref = hostRef ?? userRef ?? null;

  if (ref !== REF) {
    errors.push(
      `${name} points at ${ref ? `project "${ref}"` : `host "${url.hostname}"`}, not the WonderHome project "${REF}".`,
    );
  }
}

/** Catch any other variable smuggling in a different Supabase project. */
function checkStrayProjects() {
  const checked = new Set([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_DB_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_PRISMA_URL",
  ]);

  for (const [name, value] of Object.entries(process.env)) {
    if (checked.has(name) || typeof value !== "string") continue;

    for (const [, ref] of value.matchAll(
      /\b(?:db\.)?([a-z]{20})\.supabase\.(?:co|in|red)\b/g,
    )) {
      if (ref !== REF) {
        errors.push(
          `${name} mentions Supabase project "${ref}". WonderHome connects to "${REF}" only.`,
        );
        break;
      }
    }
  }
}

if (process.env.SKIP_ENV_VALIDATION === "1") {
  console.log("supabase-env: skipped (SKIP_ENV_VALIDATION=1)");
  process.exit(0);
}

loadEnvFiles();

checkUrlVar("NEXT_PUBLIC_SUPABASE_URL", { required: true });
checkKeyVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", { required: true });
checkKeyVar("SUPABASE_SECRET_KEY", { required: false });
for (const name of [
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
]) {
  checkPostgresVar(name);
}
checkStrayProjects();

for (const warning of warnings) {
  console.warn(`supabase-env: warning: ${warning}`);
}

if (errors.length > 0) {
  console.error(
    `\nsupabase-env: WonderHome is pinned to Supabase project "${REF}".\n`,
  );
  for (const error of errors) {
    console.error(`  ✗ ${error}`);
  }
  console.error(
    "\nFix the environment, or set SKIP_ENV_VALIDATION=1 if you are running " +
      "a task that needs no database.\n",
  );
  process.exit(1);
}

console.log(`supabase-env: ok — pinned to Supabase project "${REF}"`);
