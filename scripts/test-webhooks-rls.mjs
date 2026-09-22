#!/usr/bin/env node
/**
 * Outbound webhooks: household_webhooks and webhook_deliveries (story 18-007).
 *
 * Both tables are unreachable from any household session at all -- not read,
 * not written, admin included. This isn't a narrower version of the
 * `household_ai_credentials`-style "write, but never read back" exception;
 * it went through that shape first and was pulled back out before the
 * migration ever shipped, for two reasons found in the same afternoon:
 *
 *   1. `webhooks/repository.ts` never writes through the household's own
 *      client anyway. Every write (create/rotate/disable/enable) already
 *      goes through the admin/service-role client, with the admin check
 *      done in application code (`requireAdmin`), because handing back the
 *      freshly-generated secret in the response needs that client
 *      regardless of what RLS would otherwise allow. A household-scoped
 *      insert/update/delete policy would have been pure unused surface.
 *   2. It was also a landmine, confirmed empirically against a scratch
 *      database while building this file: an UPDATE or DELETE whose WHERE
 *      clause inspects an actual column value (`where id = '...'`, not a
 *      literal like `where true`) additionally requires SELECT-level
 *      visibility on that row for Postgres to decide whether it matches --
 *      not just the UPDATE/DELETE policy's own USING clause. With no
 *      SELECT policy on a table (the whole point, so a secret is never
 *      readable), that visibility check always fails, so
 *      `UPDATE ... WHERE id = '<this one row>'` silently matches and
 *      changes zero rows for every session, admin included -- only a
 *      blanket, unconditional UPDATE with no WHERE at all would go
 *      through. A policy that only "works" when nobody names which row
 *      they mean is not a policy worth keeping, so this table has none.
 *
 * A member's own read of "what webhooks are configured" goes through
 * `list_webhook_subscriptions()`, a SECURITY DEFINER function that answers
 * everything except the signing secret -- it bypasses table RLS entirely
 * (it runs as its owner), so none of the above affects it.
 *
 * `webhook_deliveries` carries an in-flight payload (a copy of household
 * content); it is nobody's to read from any session either, the same
 * "no client reach, service role only" shape `homesend_share_handoffs` and
 * `audit_events` already use.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_webhooks_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";

const SECRET = "a-secret-that-is-at-least-thirty-two-characters-long";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'priya@example.test'), ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Priya'), ('${OUTSIDER}', 'Outsider');`, options);
  const partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Priya') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);

  asProfile(OUTSIDER, `select wh.create_household('Outsider Home', 'Outsider');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

/** Writes a webhook subscription with the privileged connection, standing in for `createAdminClient()`, and returns its id. */
function seedWebhook(urlSuffix, eventTypes = ["member.added"]) {
  return psql(
    `insert into public.household_webhooks (household_id, url, secret, event_types, created_by_member_id)
     values ('${household}', 'https://example.com/${urlSuffix}', '${SECRET}', array[${eventTypes.map((t) => `'${t}'`).join(",")}], '${headMember}')
     returning id;`,
    options,
  );
}

test("no household session, however privileged, can create a webhook subscription directly", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.household_webhooks (household_id, url, secret, event_types, created_by_member_id)
       values ('${household}', 'https://example.com/should-not-exist', '${SECRET}', array['member.added'], '${headMember}');`,
      options,
    ),
    "the household's own administrator was able to create a webhook subscription directly",
  );
  assert.ok(
    deniedForProfile(
      PARTNER,
      `insert into public.household_webhooks (household_id, url, secret, event_types, created_by_member_id)
       values ('${household}', 'https://example.com/should-not-exist-either', '${SECRET}', array['member.added'], '${headMember}');`,
      options,
    ),
    "a non-admin member was able to create a webhook subscription directly",
  );
});

test("nobody, however privileged, can select the secret back out — not even the admin who configured it", () => {
  const id = seedWebhook("read-check");
  assert.equal(
    asProfile(HEAD, `select id from public.household_webhooks where id = '${id}';`, options),
    "",
    "an administrator could read a row back from household_webhooks — the secret would be readable too",
  );
  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.household_webhooks where id = '${id}';`, options),
    "0",
  );
});

test("no household session can update or disable a webhook subscription directly", () => {
  const id = seedWebhook("update-check");

  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.household_webhooks set status = 'disabled' where id = '${id}';`,
      `select status from public.household_webhooks where id = '${id}';`,
      "active",
      options,
    ),
    "the household's own administrator was able to disable a webhook subscription directly",
  );
});

test("no household session can delete a webhook subscription directly", () => {
  const id = seedWebhook("delete-check");

  assert.ok(
    deniedForUpdate(
      HEAD,
      `delete from public.household_webhooks where id = '${id}';`,
      `select count(*) from public.household_webhooks where id = '${id}';`,
      "1",
      options,
    ),
    "the household's own administrator was able to delete a webhook subscription directly",
  );
  // The service-role connection (what `webhooks/repository.ts` actually writes through) reaches it fine.
  psql(`delete from public.household_webhooks where id = '${id}';`, options);
  assert.equal(psql(`select count(*) from public.household_webhooks where id = '${id}';`, options), "0");
});

test("event_types must name at least one real event", () => {
  // Written through the privileged connection, standing in for the
  // service-role client that always performs this write in the real app —
  // proves the check constraint itself refuses an empty array, independent
  // of the authorization question the tests above already cover.
  assert.throws(
    () =>
      psql(
        `insert into public.household_webhooks (household_id, url, secret, event_types, created_by_member_id)
         values ('${household}', 'https://example.com/empty-events', '${SECRET}', '{}', '${headMember}');`,
        options,
      ),
    /event_types_check/,
    "the cardinality check constraint did not reject an empty event_types array",
  );
});

test("list_webhook_subscriptions() answers for any member and never returns the secret", () => {
  const id = seedWebhook("list-check");

  const asPartner = asProfile(PARTNER, `select id, url from public.list_webhook_subscriptions('${household}');`, options);
  assert.ok(asPartner.includes(id), "a non-admin member could not see the household's own webhook list");
  assert.ok(!asPartner.includes(SECRET), "list_webhook_subscriptions leaked the signing secret");

  assert.equal(
    asProfile(OUTSIDER, `select count(*) from public.list_webhook_subscriptions('${household}');`, options),
    "0",
    "an outsider could list another household's webhooks",
  );
});

test("webhook_deliveries is unreachable from any session — service role only", () => {
  const webhookId = seedWebhook("delivery-check");

  const deliveryId = psql(
    `insert into public.webhook_deliveries (webhook_id, household_id, event_type, event_id, payload)
     values ('${webhookId}', '${household}', 'member.added', gen_random_uuid(), '{"hello":"world"}'::jsonb)
     returning id;`,
    options,
  );

  assert.equal(
    asProfile(HEAD, `select id from public.webhook_deliveries where id = '${deliveryId}';`, options),
    "",
    "the household's own administrator could read the delivery queue",
  );
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.webhook_deliveries (webhook_id, household_id, event_type, event_id, payload)
       values ('${webhookId}', '${household}', 'member.added', gen_random_uuid(), '{}'::jsonb);`,
      options,
    ),
    "a household session could insert directly into the delivery queue",
  );
  assert.ok(
    deniedForUpdate(
      HEAD,
      `update public.webhook_deliveries set status = 'delivered' where id = '${deliveryId}';`,
      `select status from public.webhook_deliveries where id = '${deliveryId}';`,
      "pending",
      options,
    ),
    "a household session could update a queued delivery directly",
  );

  // The service-role connection (what `deliverPendingWebhooks()` uses) reaches it fine, because it bypasses RLS.
  psql(`update public.webhook_deliveries set status = 'delivered', delivered_at = now() where id = '${deliveryId}';`, options);
  assert.equal(psql(`select status from public.webhook_deliveries where id = '${deliveryId}';`, options), "delivered");
});
