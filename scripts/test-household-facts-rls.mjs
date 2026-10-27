#!/usr/bin/env node
/**
 * The household record index, Phase 2 (story 14-037): facts written when
 * records are written.
 *
 * `household_facts` holds a household's records as facts before any viewer
 * filter has run, and `knowledge_outbox` names which records were just
 * written. Neither is any session's to read or write, the Admin's included.
 * A member's own write to a registered table still queues its record (the
 * trigger runs as its owner), once however often it is written, and the
 * worker's claim and finish keep a record written again while it was being
 * described.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_household_facts_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";
const TOKEN = "99999999-9999-4999-8999-999999999999";

let household = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test'), ('${OUTSIDER}', 'outsider@example.test');`, options);
  household = asProfile(OWNER, `select household_id from wh.create_household('Sharma Home', 'Kunal');`, options);
  asProfile(OUTSIDER, `select wh.create_household('Other Home', 'Olu');`, options);
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const queued = () => psql(`select count(*) from public.knowledge_outbox where household_id = '${household}';`, options);

test("a member's own write queues its record, once however often it is written", () => {
  const id = asProfile(OWNER, `insert into public.backup_services (household_id, name) values ('${household}', 'QuickClean Agency') returning id;`, options);
  assert.equal(queued(), "1");
  asProfile(OWNER, `update public.backup_services set contact = '98765 43210' where id = '${id}';`, options);
  assert.equal(queued(), "1");
  assert.equal(psql(`select source_table || ':' || source_id from public.knowledge_outbox where household_id = '${household}';`, options), `backup_services:${id}`);
});

test("no session reads or writes the facts or the queue, not even the household's Admin", () => {
  psql(`insert into public.household_facts (household_id, source_table, source_id, domain, entity_type, summary, privacy, item) values ('${household}', 'school_teachers', 'x', 'school', 'teacher', 'Mrs Iyer is the class teacher.', 'child', '{}'::jsonb);`, options);
  for (const table of ["household_facts", "knowledge_outbox"]) {
    assert.equal(asProfile(OWNER, `select count(*) from public.${table};`, options), "0");
    assert.equal(asProfile(OUTSIDER, `select count(*) from public.${table};`, options), "0");
    asProfile(OWNER, `delete from public.${table};`, options);
  }
  assert.throws(() => asProfile(OWNER, `insert into public.household_facts (household_id, source_table, source_id, domain, entity_type, summary, privacy, item) values ('${household}', 't', 'y', 'school', 'teacher', 's', 'child', '{}'::jsonb);`, options), /row-level security/);
  assert.throws(() => asProfile(OWNER, `insert into public.knowledge_outbox (household_id, source_table, source_id) values ('${household}', 't', 'y');`, options), /row-level security/);
  assert.equal(psql(`select count(*) from public.household_facts where household_id = '${household}';`, options), "1");
  assert.equal(queued(), "1");
  assert.equal(psql(`select count(*) from pg_policies where tablename in ('household_facts', 'knowledge_outbox') and qual = 'false' and with_check = 'false';`, options), "2");
});

test("no session may claim the queue", () => {
  assert.throws(() => asProfile(OWNER, `select * from public.claim_knowledge_outbox(null, 10, '${TOKEN}');`, options), /permission denied/);
});

test("the worker's claim and finish: done goes, written-again stays, a claim is not taken twice", () => {
  assert.equal(psql(`select count(*) from public.claim_knowledge_outbox('${household}', 10, '${TOKEN}');`, options), "1");
  // Claimed: a second claim within the minute gets nothing.
  assert.equal(psql(`select count(*) from public.claim_knowledge_outbox(null, 10, gen_random_uuid());`, options), "0");
  // Written again while it was being described: finishing lets it go back to the queue, unclaimed.
  psql(`update public.backup_services set notes = 'Call a day ahead' where household_id = '${household}';`, options);
  psql(`select public.finish_knowledge_outbox('${TOKEN}', '[]'::jsonb);`, options);
  assert.equal(psql(`select count(*) from public.knowledge_outbox where household_id = '${household}' and claim_token is null;`, options), "1");
  // Claimed again and finished with nothing new: it goes.
  psql(`select count(*) from public.claim_knowledge_outbox('${household}', 10, '${TOKEN}');`, options);
  psql(`select public.finish_knowledge_outbox('${TOKEN}', '[]'::jsonb);`, options);
  assert.equal(queued(), "0");
});

test("a failed record is tried again, five times at most", () => {
  const id = psql(`insert into public.backup_services (household_id, name) values ('${household}', 'SparkFix') returning id;`, options);
  const failed = `'[{"table":"backup_services","id":"${id}"}]'::jsonb`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    psql(`select count(*) from public.claim_knowledge_outbox('${household}', 10, '${TOKEN}');`, options);
    psql(`select public.finish_knowledge_outbox('${TOKEN}', ${failed});`, options);
    assert.equal(psql(`select attempts from public.knowledge_outbox where source_id = '${id}';`, options), String(attempt));
  }
  psql(`select count(*) from public.claim_knowledge_outbox('${household}', 10, '${TOKEN}');`, options);
  psql(`select public.finish_knowledge_outbox('${TOKEN}', ${failed});`, options);
  assert.equal(queued(), "0");
});

test("a delete queues the record, so its fact can go", () => {
  psql(`delete from public.backup_services where household_id = '${household}';`, options);
  assert.equal(queued(), "2");
});

test("a household's delete is not refused by its queue, and its facts go with it", () => {
  psql(`delete from public.households where id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.household_facts;`, options), "0");
  assert.equal(psql(`select count(*) from public.households where id = '${household}';`, options), "0");
});
