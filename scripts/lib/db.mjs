/**
 * Thin psql wrapper for database tests.
 *
 * Uses psql rather than a driver dependency so the tests run anywhere the
 * standard PostgreSQL client exists — a CI service container, or a local
 * cluster — with no extra install step.
 *
 * SQL is fed through stdin so psql meta-commands are available: the session
 * preamble (role and JWT claims) is written to /dev/null, and only the query
 * under test produces output. Without that, the claims echo — which contains a
 * UUID — lands in the result and quietly corrupts parsing.
 */
import { execFileSync } from "node:child_process";

function run(database, script) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", database, "-tA", "-f", "-"], {
    encoding: "utf8",
    input: script,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function psql(sql, { database = process.env.PGDATABASE ?? "postgres" } = {}) {
  return run(database, sql);
}

/**
 * Runs `sql` as the given authenticated profile, exactly as a request would:
 * the `authenticated` role plus the JWT claims that auth.uid() reads.
 */
export function asProfile(profileId, sql, { database = process.env.PGDATABASE ?? "postgres" } = {}) {
  const claims = JSON.stringify({ sub: profileId, role: "authenticated" }).replace(/'/g, "''");
  return run(
    database,
    `\\o /dev/null
set role authenticated;
select set_config('request.jwt.claims', '${claims}', false);
\\o
${sql}`,
  );
}

/** Runs `sql` as the `anon` role — a signed-out visitor. */
export function asAnonymous(sql, { database = process.env.PGDATABASE ?? "postgres" } = {}) {
  return run(database, `\\o /dev/null\nset role anon;\n\\o\n${sql}`);
}

/** True when running `sql` as `profileId` is rejected — used to assert a denial. */
export function deniedForProfile(profileId, sql, options = {}) {
  try {
    asProfile(profileId, sql, options);
    return false;
  } catch {
    return true;
  }
}

/** True when a signed-out visitor is refused, whether by policy or by grant. */
export function deniedForAnonymous(sql, options = {}) {
  try {
    const rows = asAnonymous(sql, options);
    return rows === "" || rows === "0";
  } catch {
    return true;
  }
}
