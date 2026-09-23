#!/usr/bin/env node
/**
 * Public RPC wrappers for wh.autonomy_for, wh.record_usage and wh.busy_windows
 * (migration 20260924120000).
 *
 * PostgREST only resolves RPCs in `public`, so the application's
 * `rpc("autonomy_for")` and friends used to 404 against functions that live
 * in `wh`. These tests hold the wrappers to what they may and may not do:
 *
 *   - autonomy_for and record_usage answer the trusted server (service_role)
 *     and nobody else — not a signed-in member, not an anonymous caller;
 *   - busy_windows answers a signed-in member of the household only, because
 *     its membership check reads the caller's own JWT;
 *   - autonomy still resolves to "observe" for anything nobody configured,
 *     each household reads only its own settings, and `wh` stays unexposed.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_rpc_wrappers_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";
let otherHousehold = "";

/** Runs `sql` as a role with no JWT — how the trusted server or an anonymous caller reaches the database. */
function asRole(role, sql) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", DB, "-tA", "-f", "-"], {
    encoding: "utf8",
    input: `\\o /dev/null\nset role ${role};\n\\o\n${sql}`,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function denied(run) {
  try {
    run();
    return false;
  } catch (thrown) {
    return /permission denied/i.test(String(thrown.stderr ?? thrown.message));
  }
}

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${HEAD}', 'priya@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Mehta Home', 'Priya');`, options).split(" ");
  [otherHousehold] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`, options).split(" ");

  psql(
    `insert into public.responsibilities (household_id, outcome_key, ai_mode) values
       ('${household}', 'groceries.stocked', 'execute'),
       ('${household}', 'laundry.ready', 'prepare'),
       ('${household}', 'meals.dinner_ready', 'approve'),
       ('${household}', 'pets.cared_for', 'observe'),
       ('${otherHousehold}', 'groceries.stocked', 'observe');`,
    options,
  );
  psql(
    `insert into public.family_events (id, household_id, title, starts_at, ends_at, status)
       values ('44444444-4444-4444-8444-444444444444', '${household}', 'Dentist', now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed');
     insert into public.event_participants (household_id, event_id, member_id) values ('${household}', '44444444-4444-4444-8444-444444444444', '${headMember}');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

// --- A. autonomy resolves, through the wrapper, to what was configured -------

test("A1–A4: the trusted server reads each configured mode exactly", () => {
  const read = (key) => asRole("service_role", `select public.autonomy_for('${household}', '${key}');`);
  assert.equal(read("pets.cared_for"), "observe");
  assert.equal(read("laundry.ready"), "prepare");
  assert.equal(read("meals.dinner_ready"), "approve");
  assert.equal(read("groceries.stocked"), "execute");
});

test("an outcome nobody configured still resolves to observe — the wrapper adds no default of its own", () => {
  assert.equal(asRole("service_role", `select public.autonomy_for('${household}', 'nothing.configured');`), "observe");
  assert.equal(asRole("service_role", `select public.autonomy_for(gen_random_uuid(), 'groceries.stocked');`), "observe");
});

test("C1/C2: each household reads only its own setting — the same outcome can be execute in one and observe in another", () => {
  assert.equal(asRole("service_role", `select public.autonomy_for('${household}', 'groceries.stocked');`), "execute");
  assert.equal(asRole("service_role", `select public.autonomy_for('${otherHousehold}', 'groceries.stocked');`), "observe");
});

// --- C. who may call what ----------------------------------------------------

test("C3: a signed-in member cannot call the server-only wrappers, even for their own household", () => {
  assert.ok(denied(() => asProfile(HEAD, `select public.autonomy_for('${household}', 'groceries.stocked');`, options)), "a member read autonomy directly");
  assert.ok(
    denied(() => asProfile(HEAD, `select * from public.record_usage('${household}', 'ai.agent_runs', date_trunc('month', now()), 1, 10);`, options)),
    "a member recorded usage directly",
  );
});

test("C4: an anonymous caller can call none of the wrappers", () => {
  assert.ok(denied(() => asRole("anon", `select public.autonomy_for('${household}', 'groceries.stocked');`)), "anon read autonomy");
  assert.ok(denied(() => asRole("anon", `select * from public.record_usage('${household}', 'ai.agent_runs', date_trunc('month', now()), 1, 10);`)), "anon recorded usage");
  assert.ok(denied(() => asRole("anon", `select * from public.busy_windows('${household}', now(), now() + interval '7 days');`)), "anon read free/busy");
});

test("C5: the trusted server can meter usage through the wrapper, atomically, with the same answer wh.record_usage gives", () => {
  const first = asRole("service_role", `select used || ':' || allowed from public.record_usage('${household}', 'ai.agent_runs', date_trunc('month', now()), 2, 3);`);
  const second = asRole("service_role", `select used || ':' || allowed from public.record_usage('${household}', 'ai.agent_runs', date_trunc('month', now()), 2, 3);`);
  assert.equal(first, "2:true");
  assert.equal(second, "4:false");
  assert.equal(psql(`select used from public.usage_counters where household_id = '${household}' and feature_key = 'ai.agent_runs';`, options), "4");
});

test("busy_windows: a member of the household sees free/busy through the wrapper; an outsider and the service role see nothing", () => {
  assert.equal(asProfile(HEAD, `select count(*) from public.busy_windows('${household}', now(), now() + interval '7 days');`, options), "1");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.busy_windows('${household}', now(), now() + interval '7 days');`, options), "0");
  assert.ok(denied(() => asRole("service_role", `select count(*) from public.busy_windows('${household}', now(), now() + interval '7 days');`)), "the service role was granted free/busy");
});

test("busy_windows through the wrapper still says when and nothing about what", () => {
  assert.throws(() => asProfile(HEAD, `select title from public.busy_windows('${household}', now(), now() + interval '7 days');`, options));
});

// --- the rest of `wh` stays unexposed -----------------------------------------

test("only these three wrappers were added to public, and the privileges are exactly as intended", () => {
  const privileges = psql(
    `select string_agg(fn || ':' || role || '=' || allowed, ',' order by fn, role) from (
       select p.proname as fn, r.rolname as role, has_function_privilege(r.rolname, p.oid, 'execute')::text as allowed
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
       where n.nspname = 'public' and p.proname in ('autonomy_for', 'record_usage', 'busy_windows')
     ) s;`,
    options,
  );
  assert.equal(
    privileges,
    [
      "autonomy_for:anon=false", "autonomy_for:authenticated=false", "autonomy_for:service_role=true",
      "busy_windows:anon=false", "busy_windows:authenticated=true", "busy_windows:service_role=false",
      "record_usage:anon=false", "record_usage:authenticated=false", "record_usage:service_role=true",
    ].join(","),
  );
  assert.equal(
    psql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('autonomy_for', 'record_usage', 'busy_windows');`, options),
    "3",
  );
});

test("each wrapper runs with an empty search_path, so nothing can be shadowed into it", () => {
  const configs = psql(
    `select string_agg(p.proname || '=' || coalesce(array_to_string(p.proconfig, ';'), ''), ',' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('autonomy_for', 'record_usage', 'busy_windows');`,
    options,
  );
  assert.equal(configs, 'autonomy_for=search_path="",busy_windows=search_path="",record_usage=search_path=""');
});
