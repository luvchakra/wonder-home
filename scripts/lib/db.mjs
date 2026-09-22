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
 *
 * Two gotchas this file exists to stop you from re-discovering the hard way
 * (both have bitten real test files more than once):
 *
 * 1. **An UPDATE or DELETE with no matching RLS policy does not throw.**
 *    Postgres just matches and changes zero rows — no error, nothing
 *    `deniedForProfile`'s try/catch can see. This holds for both commands
 *    for the same reason: their policies filter by a USING clause (no WITH
 *    CHECK on DELETE at all, and UPDATE's WITH CHECK only fires once a row
 *    already passed USING and is actually being written), and a row that
 *    fails USING is simply excluded from the set to touch, not rejected.
 *    Testing "no UPDATE/DELETE policy grants this" needs `deniedForUpdate`
 *    below (its name predates realizing DELETE has the identical gap — it
 *    works unchanged for a DELETE statement, since it only cares whether
 *    the row changed), not `deniedForProfile`: it re-reads the row
 *    afterwards and checks nothing actually changed, which is the only way
 *    to tell "correctly refused" apart from "ran and quietly did nothing"
 *    (the two look identical from `deniedForProfile`'s point of view).
 *    `deniedForProfile` stays correct for INSERT/SELECT, and for an
 *    UPDATE/DELETE that a CHECK constraint or a column-level grant
 *    genuinely throws on — it is specifically the *silent no-op* case it
 *    cannot see. (`scripts/test-webhooks-rls.mjs` is where the DELETE case
 *    was found to bite, while adding a "non-admin cannot delete" assertion
 *    for `household_webhooks`.)
 *
 * 2. **Every test in one file shares one database**, built once in that
 *    file's `before()` hook — there is no per-test isolation. A test that
 *    mutates a profile's standing in the household (grants it a role,
 *    changes a member's status) changes what every *later* test in the same
 *    file sees that profile as able to do. This is sometimes exactly the
 *    point (asserting a promotion took effect), but it means test order
 *    inside a file is part of its correctness: an "outsider cannot do X"
 *    assertion has to run *before* whatever later test legitimately makes
 *    that same profile an insider, or it will fail for the wrong reason —
 *    or, worse, silently pass for the wrong reason if the actions happen to
 *    still be denied for some *other* reason too. When adding a test that
 *    depends on a profile's permissions being what they were at file start,
 *    check whether a later test in the same file changes them, and if the
 *    new test needs "before" semantics, put it before that one.
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

/**
 * True when an UPDATE as `profileId` did not take effect — thrown error or
 * silent no-op alike (see the file-level comment above for why a plain
 * `deniedForProfile` cannot tell these apart for an UPDATE). `checkSql`
 * re-reads the value after the attempt, as a privileged connection (plain
 * `psql`, not `asProfile`) so the check itself is never blocked by the same
 * RLS the update was testing; `expectedUnchanged` is what that value was —
 * and must still be — before the attempt.
 *
 * @example
 *   assert.ok(
 *     deniedForUpdate(
 *       STRANGER,
 *       `update public.household_members set nickname = 'Planted' where id = '${headMember}';`,
 *       `select nickname from public.household_members where id = '${headMember}';`,
 *       "KC",
 *       options,
 *     ),
 *     "an outsider could edit another household's member details",
 *   );
 */
export function deniedForUpdate(profileId, updateSql, checkSql, expectedUnchanged, options = {}) {
  try {
    asProfile(profileId, updateSql, options);
  } catch {
    // A thrown error (a column-level grant, say) is also a denial — the
    // follow-up read below is what actually decides this either way.
  }
  return psql(checkSql, options) === expectedUnchanged;
}
