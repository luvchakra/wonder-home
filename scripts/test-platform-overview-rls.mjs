#!/usr/bin/env node
/**
 * Platform-admin Overview aggregates (`public.platform_overview`): only the
 * service role can call it, and only for an active platform staff profile.
 * What it returns adds up (households by plan = households) and carries no
 * household name, person or email.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForAnonymous, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_platform_overview_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const OTHER = "44444444-4444-4444-8444-444444444444";
const STAFF = "22222222-2222-4222-8222-222222222222";
const SUSPENDED = "33333333-3333-4333-8333-333333333333";

const asServiceRole = (sql) => psql(`\\o /dev/null\nset role service_role;\n\\o\n${sql}`, options);
const overview = () => JSON.parse(asServiceRole(`select public.platform_overview('${STAFF}')::text;`));

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@overview.test'), ('${OTHER}', 'asha@overview.test'),
       ('${STAFF}', 'staff@overview.test'), ('${SUSPENDED}', 'suspended@overview.test');
     insert into public.profiles (id, display_name) values ('${STAFF}', 'Staff'), ('${SUSPENDED}', 'Gone');
     insert into public.platform_admins (profile_id, role, status) values ('${STAFF}', 'support', 'active'), ('${SUSPENDED}', 'operator', 'suspended');`,
    options,
  );
  asProfile(HEAD, `select wh.create_household('Chakraborty Home', 'Kunal');`, options);
  const other = asProfile(OTHER, `select household_id from wh.create_household('Sen Home', 'Asha');`, options);
  psql(
    `insert into public.household_subscriptions (household_id, plan_key, status) values ('${other}', 'pro', 'active')
       on conflict (household_id) do update set plan_key = excluded.plan_key;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("anon and signed-in people, staff included, cannot execute it", () => {
  assert.ok(deniedForAnonymous(`select public.platform_overview('${STAFF}');`, options));
  assert.ok(deniedForProfile(HEAD, `select public.platform_overview('${HEAD}');`, options));
  assert.ok(deniedForProfile(STAFF, `select public.platform_overview('${STAFF}');`, options));
  assert.equal(
    psql(`select has_function_privilege('anon', 'public.platform_overview(uuid)', 'execute') or has_function_privilege('authenticated', 'public.platform_overview(uuid)', 'execute');`, options),
    "f",
  );
});

test("the service role gets nothing for a profile that is not active staff", () => {
  for (const id of [HEAD, SUSPENDED, "99999999-9999-4999-8999-999999999999"]) {
    assert.throws(() => asServiceRole(`select public.platform_overview('${id}');`), /platform staff only/);
  }
  assert.throws(() => asServiceRole(`select public.platform_overview(null);`), /platform staff only/);
});

test("the figures add up: plans cover every household, 60 days of series, today's new households counted", () => {
  const o = overview();
  assert.equal(o.totals.households, 2);
  assert.equal(o.totals.people, 2);
  assert.equal(o.byPlan.reduce((s, p) => s + p.households, 0), o.totals.households);
  assert.deepEqual(Object.fromEntries(o.byPlan.map((p) => [p.plan, p.households])), { free: 1, pro: 1 });
  assert.equal(o.daily.length, 60);
  assert.equal(o.daily.reduce((s, d) => s + d.newHouseholds, 0), 2);
  assert.equal(o.daily.at(-1).newHouseholds, 2);
  assert.equal(o.quietSetups, 0, "households made today are not yet quiet");
  assert.deepEqual(Object.keys(o.active).sort(), ["last30", "last7", "prev30", "prev7"]);
});

test("it names no household, person or email", () => {
  const out = asServiceRole(`select public.platform_overview('${STAFF}')::text;`);
  for (const word of ["Chakraborty", "Sen Home", "Kunal", "Asha", "overview.test", HEAD, OTHER]) {
    assert.ok(!out.includes(word), `${word} reached the overview`);
  }
});

test("a household set up days ago that nobody came back to is a quiet setup; a sign-in after day one clears it", () => {
  psql(`update public.households set created_at = now() - interval '5 days' where name = 'Sen Home';`, options);
  assert.equal(overview().quietSetups, 1);
  psql(`update auth.users set last_sign_in_at = now() - interval '1 hour' where id = '${OTHER}';`, options);
  assert.equal(overview().quietSetups, 0);
});
