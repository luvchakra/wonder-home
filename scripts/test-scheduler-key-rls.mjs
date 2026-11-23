#!/usr/bin/env node
/**
 * The scheduler key in Platform admin (migration 20261123160000, 2026-11-23).
 *
 * Saving CRON_SECRET must update the Vault secret pg_cron already sends
 * (`cron_secret`), not make a second one, so the scheduler and the routes can't
 * drift; other secrets keep their own names; the key can be replaced, never
 * cleared. The test database has no Vault, so a stand-in is made here.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_scheduler_key_test";
const options = { database: DB };
const OWNER = "11111111-1111-4111-8111-111111111111";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values ('${OWNER}', 'kunal@example.test');
     insert into public.profiles (id, display_name) values ('${OWNER}', 'Kunal') on conflict (id) do nothing;
     insert into public.platform_admins (profile_id, role) values ('${OWNER}', 'owner');
     create schema vault;
     create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
     create function vault.create_secret(p_secret text, p_name text, p_description text) returns uuid language sql
       as $$ insert into vault.secrets (name, secret) values (p_name, p_secret) returning id $$;
     create function vault.update_secret(p_id uuid, p_secret text) returns void language sql
       as $$ update vault.secrets set secret = p_secret where id = p_id $$;
     insert into vault.secrets (name, secret) values ('cron_secret', 'the-old-drifted-value');`,
    options,
  );
});

test("saving the scheduler key replaces the Vault secret pg_cron sends, with no second copy", () => {
  assert.equal(psql(`select public.platform_config_secret_set('CRON_SECRET', 'new-scheduler-key-0123456789abcdef', '${OWNER}');`, options), "cdef");
  assert.equal(psql("select secret from vault.secrets where name = 'cron_secret';", options), "new-scheduler-key-0123456789abcdef");
  assert.equal(psql("select count(*) from vault.secrets;", options), "1");
  assert.equal(
    psql("select count(*) from public.platform_config c join vault.secrets s on s.id = c.vault_secret_id where c.key = 'CRON_SECRET' and s.name = 'cron_secret';", options),
    "1",
  );
});

test("other secrets keep their own Vault names", () => {
  psql(`select public.platform_config_secret_set('GITHUB_DISPATCH_TOKEN', 'github_pat_0123456789', '${OWNER}');`, options);
  assert.equal(psql("select count(*) from vault.secrets where name = 'wonderhome_config_github_dispatch_token';", options), "1");
});

test("the scheduler key can be replaced, never cleared", () => {
  assert.throws(() => psql(`select public.platform_config_clear('CRON_SECRET', '${OWNER}');`, options), /replaced, not cleared/);
  assert.equal(psql("select secret from vault.secrets where name = 'cron_secret';", options), "new-scheduler-key-0123456789abcdef");
  psql(`select public.platform_config_clear('GITHUB_DISPATCH_TOKEN', '${OWNER}');`, options);
  assert.equal(psql("select count(*) from public.platform_config where key = 'GITHUB_DISPATCH_TOKEN';", options), "0");
});
