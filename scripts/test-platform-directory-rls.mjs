#!/usr/bin/env node
/**
 * Platform admin account lists: service role only, platform OWNER only, account
 * fields only, one audit row per view, and the plans add up to the households.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asAnonymous, asProfile, deniedForAnonymous, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_platform_directory_test";
const options = { database: DB };
const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const HEAD = "33333333-3333-4333-8333-333333333333";

const asServiceRole = (sql) => psql(`\\o /dev/null\nset role service_role;\n\\o\n${sql}`, options);

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${OWNER}', 'owner@wonderhome.test'), ('${STAFF}', 'staff@wonderhome.test'), ('${HEAD}', 'head@wonderhome.test');
     insert into public.profiles (id, display_name) values ('${OWNER}', 'Owner'), ('${STAFF}', 'Staff'), ('${HEAD}', 'Head');
     insert into public.platform_admins (profile_id, role, status) values ('${OWNER}', 'owner', 'active'), ('${STAFF}', 'operator', 'active');`,
    options,
  );
  asProfile(HEAD, `select * from wh.create_household('Alpha Home', 'Head');`, options);
  psql(`insert into public.households (name) values ('No Plan Home');`, options);
});
after(() => psql(`drop database if exists ${DB}`, { database: "postgres" }));

const FNS = [
  ["platform_plan_breakdown(uuid)", (a) => `select public.platform_plan_breakdown('${a}')::text;`],
  ["platform_directory_households(uuid,text,text,int,int)", (a) => `select public.platform_directory_households('${a}', null, null, 25, 0)::text;`],
  ["platform_directory_people(uuid,text,int,int)", (a) => `select public.platform_directory_people('${a}', null, 25, 0)::text;`],
  ["platform_directory_grants(uuid)", (a) => `select public.platform_directory_grants('${a}')::text;`],
];

test("anon, members and even staff sessions cannot execute any list", () => {
  for (const [, sql] of FNS) {
    assert.ok(deniedForAnonymous(sql(OWNER), options));
    assert.ok(deniedForProfile(HEAD, sql(HEAD), options));
    assert.ok(deniedForProfile(OWNER, sql(OWNER), options));
  }
});

test("the service role is refused for anyone but an active platform owner", () => {
  for (const [, sql] of FNS) {
    for (const id of [STAFF, HEAD, "99999999-9999-4999-8999-999999999999"]) {
      assert.throws(() => asServiceRole(sql(id)), /platform owner only/);
    }
  }
});

test("households carry account fields only, and plans add up to the total", () => {
  const list = JSON.parse(asServiceRole(FNS[1][1](OWNER)));
  assert.equal(list.total, 2);
  assert.deepEqual(Object.keys(list.rows[0]).sort(), ["created_at", "id", "last_active", "members", "name", "plan_key", "plan_name", "status"]);
  const plans = JSON.parse(asServiceRole(FNS[0][1](OWNER)));
  assert.equal(plans.reduce((n, p) => n + p.count, 0), list.total);
  assert.ok(list.rows.every((r) => r.plan_key === "free" || r.plan_key));
});

test("people carry account fields only", () => {
  const people = JSON.parse(asServiceRole(FNS[2][1](OWNER)));
  assert.ok(people.total >= 1);
  assert.deepEqual(Object.keys(people.rows[0]).sort(), ["admin", "created_at", "email", "has_signed_in", "household_id", "household_name", "id", "last_sign_in", "name", "type"]);
});

test("each list view writes one audit row without the rows", () => {
  const before = Number(psql(`select count(*) from public.audit_events where event_type in ('platform.households_viewed','platform.people_viewed');`, options));
  asServiceRole(FNS[1][1](OWNER));
  asServiceRole(FNS[2][1](OWNER));
  const after = Number(psql(`select count(*) from public.audit_events where event_type in ('platform.households_viewed','platform.people_viewed');`, options));
  assert.equal(after - before, 2);
  const meta = psql(`select string_agg(metadata::text, '') from public.audit_events where event_type like 'platform.%_viewed';`, options);
  assert.ok(!meta.includes("Alpha Home") && !meta.includes("head@wonderhome.test"));
});
