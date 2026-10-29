#!/usr/bin/env node
/**
 * Platform-admin Performance snapshot: only the service role can call it, and
 * even then only for an active platform staff profile. Anon and signed-in
 * members, staff included, cannot execute it at all.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asAnonymous, asProfile, deniedForAnonymous, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_platform_performance_test";
const options = { database: DB };

const MEMBER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const SUSPENDED = "33333333-3333-4333-8333-333333333333";

const asServiceRole = (sql) => psql(`\\o /dev/null\nset role service_role;\n\\o\n${sql}`, options);

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${MEMBER}', 'member@wonderhome.test'),
       ('${STAFF}', 'staff@wonderhome.test'),
       ('${SUSPENDED}', 'suspended@wonderhome.test');
     insert into public.profiles (id, display_name) values ('${MEMBER}', 'Member'), ('${STAFF}', 'Staff'), ('${SUSPENDED}', 'Gone');
     insert into public.platform_admins (profile_id, role, status) values ('${STAFF}', 'support', 'active'), ('${SUSPENDED}', 'operator', 'suspended');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("anon cannot execute the snapshot", () => {
  assert.ok(deniedForAnonymous(`select public.platform_performance_snapshot('${STAFF}');`, options));
});

test("a signed-in member cannot execute it", () => {
  assert.ok(deniedForProfile(MEMBER, `select public.platform_performance_snapshot('${MEMBER}');`, options));
});

test("platform staff cannot call it from their own session either; the server does, through the grant", () => {
  assert.ok(deniedForProfile(STAFF, `select public.platform_performance_snapshot('${STAFF}');`, options));
});

test("the service role gets nothing for a profile that is not active staff", () => {
  for (const id of [MEMBER, SUSPENDED, "99999999-9999-4999-8999-999999999999"]) {
    assert.throws(() => asServiceRole(`select public.platform_performance_snapshot('${id}');`), /platform staff only/);
  }
  assert.throws(() => asServiceRole(`select public.platform_performance_snapshot(null);`), /platform staff only/);
});

test("the service role gets aggregate figures for active staff, and no row contents", () => {
  const out = asServiceRole(`select public.platform_performance_snapshot('${STAFF}')::text;`);
  const snapshot = JSON.parse(out);
  assert.ok(snapshot.connections.max > 0);
  assert.ok(Array.isArray(snapshot.largestTables));
  assert.ok(!out.includes("member@wonderhome.test"), "an email reached the snapshot");
  assert.ok(!out.includes("Staff"), "a display name reached the snapshot");
});

test("nothing leaks to anon through the function's ACL", () => {
  assert.equal(
    psql(`select has_function_privilege('anon', 'public.platform_performance_snapshot(uuid)', 'execute') or has_function_privilege('authenticated', 'public.platform_performance_snapshot(uuid)', 'execute');`, options),
    "f",
  );
});
