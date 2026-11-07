#!/usr/bin/env node
/**
 * Platform settings (16-010): nobody but the service role reads or writes the
 * table or calls its functions; the service role's writes need an active
 * staff actor, are audited (only "changed" for a secret) and rate-limited;
 * the status function never returns a secret's value.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { deniedForAnonymous, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_platform_config_test";
const options = { database: DB };

const MEMBER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const SUSPENDED = "33333333-3333-4333-8333-333333333333";

const asServiceRole = (sql) => psql(`\\o /dev/null\nset role service_role;\n\\o\n${sql}`, options);
const hasVault = () => psql(`select exists (select 1 from pg_namespace where nspname = 'vault');`, options) === "t";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${MEMBER}', 'member@wonderhome.test'), ('${STAFF}', 'staff@wonderhome.test'), ('${SUSPENDED}', 'gone@wonderhome.test');
     insert into public.profiles (id, display_name) values ('${MEMBER}', 'Member'), ('${STAFF}', 'Staff'), ('${SUSPENDED}', 'Gone');
     insert into public.platform_admins (profile_id, role, status) values ('${STAFF}', 'owner', 'active'), ('${SUSPENDED}', 'operator', 'suspended');
     insert into public.platform_config (key, value, updated_by) values ('WONDERHOME_WEATHER_PROVIDER', 'open-meteo', '${STAFF}');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("anon and signed-in people, staff included, can't read the table", () => {
  assert.ok(deniedForAnonymous(`select count(*) from public.platform_config;`, options) || psql(`set role anon; select count(*) from public.platform_config;`, options) === "0");
  for (const who of [MEMBER, STAFF]) {
    assert.ok(deniedForProfile(who, `select key, value from public.platform_config;`, options), `${who} read platform_config`);
    assert.ok(deniedForProfile(who, `insert into public.platform_config (key, value) values ('WONDERHOME_DEVELOPER_API', 'on');`, options), `${who} wrote platform_config`);
  }
});

test("anon and signed-in people can't execute any settings function", () => {
  const calls = [
    `select * from public.platform_config_read();`,
    `select * from public.platform_config_status();`,
    `select public.platform_config_set('WONDERHOME_DEVELOPER_API', 'on', '${STAFF}');`,
    `select public.platform_config_secret_set('TMDB_API_KEY', 'abcdefghijklmnop', '${STAFF}');`,
    `select public.platform_config_clear('WONDERHOME_WEATHER_PROVIDER', '${STAFF}');`,
  ];
  for (const call of calls) {
    assert.ok(deniedForAnonymous(call, options), `anon: ${call}`);
    assert.ok(deniedForProfile(STAFF, call, options), `staff session: ${call}`);
  }
});

test("the service role's writes need an active staff actor", () => {
  for (const actor of [MEMBER, SUSPENDED]) {
    assert.throws(() => asServiceRole(`select public.platform_config_set('WONDERHOME_DEVELOPER_API', 'on', '${actor}');`), /not platform staff/);
  }
  assert.throws(() => asServiceRole(`select public.platform_config_set('not a key', 'on', '${STAFF}');`), /not a setting name/);
});

test("a setting change is audited with old and new", () => {
  asServiceRole(`select public.platform_config_set('WONDERHOME_WEATHER_PROVIDER', 'off', '${STAFF}');`);
  const audit = psql(`select metadata::text from public.audit_events where event_type = 'platform.config_changed' order by created_at desc limit 1;`, options);
  const row = JSON.parse(audit);
  assert.equal(row.key, "WONDERHOME_WEATHER_PROVIDER");
  assert.equal(row.old, "open-meteo");
  assert.equal(row.new, "off");
  assert.equal(asServiceRole(`select value from public.platform_config_read() where key = 'WONDERHOME_WEATHER_PROVIDER';`), "off");
});

test("a secret is kept only in Vault, audited as changed, and never in the status", { skip: !hasVault() && "no Vault in this database" }, () => {
  const value = "tmdb-token-abcdefghijkl1234";
  assert.equal(asServiceRole(`select public.platform_config_secret_set('TMDB_API_KEY', '${value}', '${STAFF}');`), "1234");
  assert.equal(psql(`select coalesce(value, '') from public.platform_config where key = 'TMDB_API_KEY';`, options), "");
  assert.ok(!asServiceRole(`select row_to_json(s)::text from public.platform_config_status() s;`).includes(value), "the status function returned a secret");
  const audit = psql(`select metadata::text from public.audit_events where event_type = 'platform.config_changed' and metadata->>'key' = 'TMDB_API_KEY';`, options);
  assert.ok(!audit.includes(value) && !audit.includes("1234"), "the audit row holds the secret");
  assert.equal(asServiceRole(`select value from public.platform_config_read() where key = 'TMDB_API_KEY';`), value);
  asServiceRole(`select public.platform_config_clear('TMDB_API_KEY', '${STAFF}');`);
  assert.equal(asServiceRole(`select count(*) from public.platform_config_read() where key = 'TMDB_API_KEY';`), "0");
});

test("more than twenty changes a minute by one person are refused", () => {
  assert.throws(() => {
    for (let i = 0; i < 25; i += 1) asServiceRole(`select public.platform_config_set('WONDERHOME_DEVELOPER_API', '${i % 2 ? "on" : "off"}', '${STAFF}');`);
  }, /rate_limited/);
});
