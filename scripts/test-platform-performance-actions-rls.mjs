#!/usr/bin/env node
/**
 * Platform-admin Performance actions: a fixed allowlist of maintenance
 * functions. Only the service role can execute them, and then only for active
 * staff of the right role; arguments are validated; every real run is audited
 * and rate limited; ending sessions touches only PostgREST sessions that are
 * idle in a transaction, never other roles and never its own backend.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

import { deniedForAnonymous, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_platform_perf_actions_test";
const options = { database: DB };

const MEMBER = "11111111-1111-4111-8111-111111111111";
const SUPPORT = "22222222-2222-4222-8222-222222222222";
const OPERATOR = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";
const SUSPENDED = "55555555-5555-4555-8555-555555555555";

const asServiceRole = (sql) => psql(`\\o /dev/null\nset role service_role;\n\\o\n${sql}`, options);
const json = (sql) => JSON.parse(asServiceRole(sql));
const count = (sql) => Number(psql(sql, options));

/** A real login as `role` (pg_stat_activity.usename is the login role), idle inside a transaction. */
function idleInTransaction(role, seconds) {
  const child = spawn("psql", ["-X", "-q", "-h", "127.0.0.1", "-U", role, "-d", DB], { stdio: ["pipe", "ignore", "ignore"], env: { ...process.env, PGPASSWORD: "wh-test-only" } });
  child.stdin.write(`begin;\nselect 1;\n\\! sleep ${seconds}\n`);
  child.stdin.end();
  return child;
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `do $$ begin
       if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if;
       if not exists (select 1 from pg_roles where rolname = 'wh_other_admin') then create role wh_other_admin; end if;
     end $$;
     alter role authenticator login password 'wh-test-only';
     alter role wh_other_admin login password 'wh-test-only';
     insert into auth.users (id, email) values
       ('${MEMBER}', 'member@wonderhome.test'), ('${SUPPORT}', 'support@wonderhome.test'),
       ('${OPERATOR}', 'operator@wonderhome.test'), ('${OWNER}', 'owner@wonderhome.test'), ('${SUSPENDED}', 'gone@wonderhome.test');
     insert into public.profiles (id, display_name) values
       ('${MEMBER}', 'Member'), ('${SUPPORT}', 'Support'), ('${OPERATOR}', 'Operator'), ('${OWNER}', 'Owner'), ('${SUSPENDED}', 'Gone');
     insert into public.platform_admins (profile_id, role, status) values
       ('${SUPPORT}', 'support', 'active'), ('${OPERATOR}', 'operator', 'active'), ('${OWNER}', 'owner', 'active'), ('${SUSPENDED}', 'owner', 'suspended');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
  psql(`alter role authenticator nologin password null; drop role if exists wh_other_admin`, { database: "postgres" });
});

const FUNCTIONS = [
  "public.platform_perf_analyze(uuid, text)",
  "public.platform_perf_reset_statements(uuid)",
  "public.platform_perf_end_idle_sessions(uuid, int, boolean)",
  "public.platform_perf_last_runs(uuid)",
];

test("anon, authenticated and public cannot execute any action; the internal helpers are not executable by anyone", () => {
  for (const fn of FUNCTIONS) {
    assert.equal(psql(`select has_function_privilege('anon', '${fn}', 'execute') or has_function_privilege('authenticated', '${fn}', 'execute');`, options), "f", fn);
    assert.equal(psql(`select has_function_privilege('service_role', '${fn}', 'execute');`, options), "t", fn);
  }
  for (const fn of ["public.platform_perf_guard(uuid, text, text, boolean, boolean)", "public.platform_perf_audit(uuid, text, text, text, timestamptz, jsonb)"]) {
    assert.equal(psql(`select has_function_privilege('service_role', '${fn}', 'execute') or has_function_privilege('authenticated', '${fn}', 'execute') or has_function_privilege('anon', '${fn}', 'execute');`, options), "f", fn);
  }
  assert.ok(deniedForAnonymous(`select public.platform_perf_analyze('${OWNER}', 'profiles');`, options));
  assert.ok(deniedForProfile(OWNER, `select public.platform_perf_analyze('${OWNER}', 'profiles');`, options));
  assert.ok(deniedForProfile(OWNER, `select public.platform_perf_end_idle_sessions('${OWNER}', 5, true);`, options));
});

test("non-staff, suspended and unknown profiles get nothing", () => {
  for (const id of [MEMBER, SUSPENDED, "99999999-9999-4999-8999-999999999999"]) {
    assert.throws(() => asServiceRole(`select public.platform_perf_analyze('${id}', 'profiles');`), /platform staff only/);
    assert.throws(() => asServiceRole(`select public.platform_perf_reset_statements('${id}');`), /platform staff only/);
    assert.throws(() => asServiceRole(`select public.platform_perf_end_idle_sessions('${id}', 5, true);`), /platform staff only/);
    assert.throws(() => asServiceRole(`select public.platform_perf_last_runs('${id}');`), /platform staff only/);
  }
  assert.throws(() => asServiceRole(`select public.platform_perf_analyze(null, 'profiles');`), /platform staff only/);
});

test("roles: support cannot run anything; operator may analyze but not the owner-only actions", () => {
  assert.throws(() => asServiceRole(`select public.platform_perf_analyze('${SUPPORT}', 'profiles');`), /cannot run this action/);
  assert.throws(() => asServiceRole(`select public.platform_perf_reset_statements('${OPERATOR}');`), /cannot run this action/);
  assert.throws(() => asServiceRole(`select public.platform_perf_end_idle_sessions('${OPERATOR}', 5, true);`), /cannot run this action/);
  assert.ok(json(`select public.platform_perf_analyze('${OPERATOR}', 'platform_admins')::text;`).ok);
  assert.ok(Array.isArray(json(`select public.platform_perf_last_runs('${SUPPORT}')::text;`)), "support may read last runs");
});

test("a bad table name is rejected, never executed, and is audited as failed", () => {
  const attempts = [`profiles"; drop table public.profiles; --`, "pg_class", "auth.users", "users", "profiles; select 1", "'", "PROFILES", ""];
  for (const [i, name] of attempts.entries()) {
    const out = json(`select public.platform_perf_analyze('${OWNER}', '${name.replaceAll("'", "''")}')::text;`);
    assert.equal(out.ok, false, name);
    assert.equal(out.reason, "unknown_table", name);
    void i;
  }
  assert.equal(count(`select count(*) from public.profiles;`) > 0, true, "the table is still there");
  assert.equal(count(`select count(*) from public.audit_events where event_type = 'platform.perf_action' and metadata->>'outcome' = 'failed';`), attempts.length);
});

test("analyze: one table and all tables succeed, write an audit row, and are rate limited per target", () => {
  const one = json(`select public.platform_perf_analyze('${OWNER}', 'profiles')::text;`);
  assert.deepEqual(one, { ok: true, tables: 1 });
  const row = JSON.parse(psql(
    `select metadata::text from public.audit_events where event_type = 'platform.perf_action' and actor_profile_id = '${OWNER}' and metadata->>'action' = 'analyze' and metadata->>'target' = 'profiles' order by created_at desc limit 1;`,
    options,
  ));
  assert.equal(row.outcome, "ok");
  assert.ok(Number.isFinite(row.durationMs));
  // the same action + target again within a minute is refused, and writes nothing
  const before = count(`select count(*) from public.audit_events where event_type = 'platform.perf_action';`);
  assert.throws(() => asServiceRole(`select public.platform_perf_analyze('${OWNER}', 'profiles');`), /rate_limited/);
  assert.equal(count(`select count(*) from public.audit_events where event_type = 'platform.perf_action';`), before);
  // another target is its own bucket
  assert.ok(json(`select public.platform_perf_analyze('${OWNER}', 'households')::text;`).ok);
  const all = json(`select public.platform_perf_analyze('${OWNER}', null)::text;`);
  assert.ok(all.ok && all.tables > 5);
});

test("last runs reports the latest run of each action and target", () => {
  const runs = json(`select public.platform_perf_last_runs('${SUPPORT}')::text;`);
  const profiles = runs.find((r) => r.action === "analyze" && r.target === "profiles");
  assert.equal(profiles.outcome, "ok");
  assert.ok(runs.some((r) => r.action === "analyze" && r.target === "*"));
  assert.ok(!JSON.stringify(runs).includes("@wonderhome.test"));
});

test("reset statistics: owner only; says so plainly when the extension is off; audited either way", () => {
  const out = json(`select public.platform_perf_reset_statements('${OWNER}')::text;`);
  const present = psql(`select count(*) from pg_extension where extname = 'pg_stat_statements';`, options) === "1";
  assert.equal(out.ok, present ? true : false);
  if (!present) assert.equal(out.reason, "extension_off");
  assert.equal(count(`select count(*) from public.audit_events where event_type = 'platform.perf_action' and metadata->>'action' = 'reset_statements';`), 1);
  assert.throws(() => asServiceRole(`select public.platform_perf_reset_statements('${OWNER}');`), /rate_limited/);
});

test("end sessions: argument range, preview is free of side effects and unaudited", () => {
  for (const bad of ["0", "-1", "1441", "null"]) {
    assert.throws(() => asServiceRole(`select public.platform_perf_end_idle_sessions('${OWNER}', ${bad}, true);`), /minutes must be between/);
  }
  const before = count(`select count(*) from public.audit_events where event_type = 'platform.perf_action';`);
  const preview = json(`select public.platform_perf_end_idle_sessions('${OWNER}', 5, true)::text;`);
  assert.deepEqual(preview, { ok: true, dryRun: true, count: 0 });
  json(`select public.platform_perf_end_idle_sessions('${OWNER}', 5, true)::text;`); // no rate limit on previews
  assert.equal(count(`select count(*) from public.audit_events where event_type = 'platform.perf_action';`), before);
});

test("end sessions: ends only an idle-in-transaction PostgREST session, never other roles or its own backend", { timeout: 150_000 }, async () => {
  const victim = idleInTransaction("authenticator", 110);
  const bystander = idleInTransaction("wh_other_admin", 110);
  await new Promise((resolve) => setTimeout(resolve, 70_000));
  const states = () => psql(`select string_agg(usename || ':' || state, ',' order by usename) from pg_stat_activity where datname = '${DB}' and usename in ('authenticator', 'wh_other_admin');`, options);
  const seen = states();
  assert.match(seen, /authenticator:idle in transaction/, `the test session never went idle in a transaction (${seen})`);
  const preview = json(`select public.platform_perf_end_idle_sessions('${OWNER}', 1, true)::text;`);
  assert.equal(preview.count, 1, "only the authenticator session is counted");
  const run = json(`select public.platform_perf_end_idle_sessions('${OWNER}', 1, false)::text;`);
  assert.deepEqual(run, { ok: true, dryRun: false, count: 1 });
  const after = states();
  assert.ok(!/authenticator:/.test(after), "the authenticator session was ended");
  assert.match(after, /wh_other_admin:idle in transaction/, "another role's session survived");
  const audit = JSON.parse(psql(`select metadata::text from public.audit_events where metadata->>'action' = 'end_idle_sessions' limit 1;`, options));
  assert.equal(audit.outcome, "ok");
  assert.equal(audit.detail.ended, 1);
  assert.throws(() => asServiceRole(`select public.platform_perf_end_idle_sessions('${OWNER}', 1, false);`), /rate_limited/);
  victim.kill();
  bystander.kill();
});
