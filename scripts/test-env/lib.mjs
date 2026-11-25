/**
 * Shared by the test-environment scripts (docs/test-environment.md).
 *
 * Every one of them works on the Supabase project `wonderhome-test` only and
 * refuses the production project outright, whatever it is told. SQL goes
 * through Supabase's management API (`/v1/projects/{ref}/database/query`)
 * with a personal access token, the same way scripts/check-migrations-applied.mjs
 * reads history, so no database password and no direct Postgres connection
 * are needed. Tokens are sent only as a bearer header and never printed.
 */

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

export function requireToken(env = process.env) {
  const token = (env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  if (!token) throw new Error("Set SUPABASE_ACCESS_TOKEN (a personal access token from supabase.com/dashboard/account/tokens).");
  return token;
}

/** Runs SQL on the test project and returns its rows. A failure throws with Postgres's message, never the token. */
export async function query(ref, token, sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      // not JSON: keep the text
    }
    throw new Error(`database/query HTTP ${response.status}: ${String(message).slice(0, 2000)}`);
  }
  return text ? JSON.parse(text) : [];
}

/** SQL string literal. */
export function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
