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
    `select public.platform_config_import('[]'::jsonb, '${STAFF}');`,
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

test("moving from Vercel saves new keys in one call, never overwrites, and moves nothing twice", () => {
  assert.throws(() => asServiceRole(`select public.platform_config_import('[]'::jsonb, '${MEMBER}');`), /not platform staff/);
  const items = JSON.stringify([
    { key: "WONDERHOME_WEATHER_PROVIDER", value: "open-meteo", secret: false },
    { key: "WONDERHOME_DEVELOPER_API", value: "on", secret: false },
  ]);
  const first = JSON.parse(asServiceRole(`select public.platform_config_import('${items}'::jsonb, '${STAFF}')::text;`));
  const status = Object.fromEntries(first.items.map((row) => [row.key, row.status]));
  assert.equal(status.WONDERHOME_WEATHER_PROVIDER, "already");
  assert.equal(status.WONDERHOME_DEVELOPER_API, "moved");
  assert.equal(asServiceRole(`select value from public.platform_config_read() where key = 'WONDERHOME_WEATHER_PROVIDER';`), "off", "an import overwrote a saved value");
  assert.equal(asServiceRole(`select value from public.platform_config_read() where key = 'WONDERHOME_DEVELOPER_API';`), "on");
  const audited = psql(`select count(*) from public.audit_events where event_type = 'platform.config_changed' and metadata->>'via' = 'move_from_vercel';`, options);
  assert.equal(audited, "1");
  const summary = JSON.parse(psql(`select metadata::text from public.audit_events where event_type = 'platform.config_moved' order by created_at desc limit 1;`, options));
  assert.equal(summary.moved, 1);
  assert.equal(summary.already, 1);
  const second = JSON.parse(asServiceRole(`select public.platform_config_import('${items}'::jsonb, '${STAFF}')::text;`));
  assert.ok(second.items.every((row) => row.status === "already"), "the second run moved something");
});

test("a secret moved from Vercel goes to Vault and never into an audit row", { skip: !hasVault() && "no Vault in this database" }, () => {
  const value = "careers-key-abcdefghijkl5678";
  const items = JSON.stringify([{ key: "TMDB_API_KEY", value, secret: true }]);
  asServiceRole(`select public.platform_config_import('${items}'::jsonb, '${STAFF}');`);
  assert.equal(psql(`select coalesce(value, '') from public.platform_config where key = 'TMDB_API_KEY';`, options), "");
  assert.equal(asServiceRole(`select value_last4 from public.platform_config_status() where key = 'TMDB_API_KEY';`), "5678");
  const audit = psql(`select string_agg(metadata::text, ' ') from public.audit_events where event_type in ('platform.config_changed', 'platform.config_moved');`, options);
  assert.ok(!audit.includes(value) && !audit.includes("5678"), "an audit row holds the secret");
});

test("more than twenty changes a minute by one person are refused", () => {
  assert.throws(() => {
    for (let i = 0; i < 25; i += 1) asServiceRole(`select public.platform_config_set('WONDERHOME_DEVELOPER_API', '${i % 2 ? "on" : "off"}', '${STAFF}');`);
  }, /rate_limited/);
});
