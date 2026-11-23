#!/usr/bin/env node
/**
 * The delivery clock's GitHub trigger (migration 20261123120000, 2026-11-23).
 *
 * Every 5 minutes pg_cron calls `wh.trigger_delivery_clock()`, which asks the
 * GitHub API to run `delivery-clock.yml` with the token saved in Platform admin
 * (`GITHUB_DISPATCH_TOKEN`, kept in Vault by `platform_config`; migration
 * 20261123150000), or else the Vault secret `github_dispatch_token`. Without the token (or without Vault or pg_net) it
 * must do nothing at all, so Vercel keeps delivering; with it, exactly one
 * request to the one workflow. Nobody reachable from a browser may call it.
 *
 * The test database has no Vault and no pg_net, so stand-ins are made here:
 * a `vault.decrypted_secrets` table and a `net.http_post` that records its call.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_delivery_clock_test";
const options = { database: DB };
const PROFILE = "11111111-1111-4111-8111-111111111111";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${PROFILE}', 'kunal@example.test');`, options);
});

test("without Vault it answers no-vault and sends nothing", () => {
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "no-vault");
});

test("with Vault but no pg_net it answers no-net", () => {
  psql("create schema vault; create table vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);", options);
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "no-net");
});

test("without the token it answers no-token and sends nothing", () => {
  psql(
    `create schema net;
     create table net.calls (url text, body jsonb, headers jsonb, timeout_milliseconds int);
     create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
     returns bigint language sql as $$ insert into net.calls values (url, body, headers, timeout_milliseconds) returning 1::bigint $$;`,
    options,
  );
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "no-token");
  psql("insert into vault.decrypted_secrets (name, decrypted_secret) values ('cron_secret', 'not-this-one'), ('github_dispatch_token', '   ');", options);
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "no-token");
  assert.equal(psql("select count(*) from net.calls;", options), "0");
});

test("with the token it dispatches delivery-clock.yml on main, once", () => {
  psql("update vault.decrypted_secrets set decrypted_secret = 'github_pat_test' where name = 'github_dispatch_token';", options);
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "dispatched");
  const [url, ref, auth, accept] = psql(
    "select url || '|' || (body->>'ref') || '|' || (headers->>'Authorization') || '|' || (headers->>'Accept') from net.calls;",
    options,
  ).split("|");
  assert.equal(url, "https://api.github.com/repos/luvchakra/wonder-home/actions/workflows/delivery-clock.yml/dispatches");
  assert.equal(ref, "main");
  assert.equal(auth, "Bearer github_pat_test");
  assert.equal(accept, "application/vnd.github+json");
  assert.equal(psql("select count(*) from net.calls;", options), "1");
});

test("the token saved in Platform admin wins over the legacy Vault name", () => {
  psql(
    `with s as (insert into vault.decrypted_secrets (name, decrypted_secret) values ('wonderhome_config_GITHUB_DISPATCH_TOKEN', 'github_pat_platform') returning id)
     insert into public.platform_config (key, secret, vault_secret_id, value_last4) select 'GITHUB_DISPATCH_TOKEN', true, id, 'form' from s;
     delete from net.calls;`,
    options,
  );
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "dispatched");
  assert.equal(psql("select headers->>'Authorization' from net.calls;", options), "Bearer github_pat_platform");
});

test("a cleared Platform admin token falls back to the legacy name, and with neither nothing is sent", () => {
  psql(
    `update vault.decrypted_secrets set decrypted_secret = '' where name = 'wonderhome_config_GITHUB_DISPATCH_TOKEN';
     delete from net.calls;`,
    options,
  );
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "dispatched");
  assert.equal(psql("select headers->>'Authorization' from net.calls;", options), "Bearer github_pat_test");
  psql("update vault.decrypted_secrets set decrypted_secret = '' where name = 'github_dispatch_token'; delete from net.calls;", options);
  assert.equal(psql("select wh.trigger_delivery_clock();", options), "no-token");
  assert.equal(psql("select count(*) from net.calls;", options), "0");
});

test("no browser role may call it", () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(psql(`select has_function_privilege('${role}', 'wh.trigger_delivery_clock()', 'execute');`, options), "f");
  }
  assert.throws(() => asProfile(PROFILE, "select wh.trigger_delivery_clock();", options));
});
