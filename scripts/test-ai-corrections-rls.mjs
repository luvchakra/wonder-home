#!/usr/bin/env node
/**
 * Correction evidence and approval fingerprints (story 14-013, Wave 5 §13,
 * §20).
 *
 * `ai_corrections` holds what a person corrected, with the values on both
 * sides. It is household data, so:
 *   - only the household's admins may read it;
 *   - no member may write it, since only the server records evidence;
 *   - nobody may rewrite it, because evidence is append-only (§13 "never
 *     erase the historical signal");
 *   - it goes with the household when the household is deleted.
 *
 * The approval fingerprint on `conversation_actions` only ever holds the
 * shape the server writes.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_ai_corrections_test";
const options = { database: DB };

const HEAD = "31111111-1111-4111-8111-111111111111";
const PARTNER = "32222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let otherHousehold = "";
let headMember = "";
let correction = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'upasana@example.test'), ('${OUTSIDER}', 'arjun@example.test');`,
    options,
  );
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Mehta Home', 'Kunal');`, options).split(" ");
  otherHousehold = asProfile(OUTSIDER, `select household_id from wh.create_household('Arjun Home', 'Arjun');`, options);

  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Upasana');`, options);
  const partnerMember = psql(
    `insert into public.household_members (household_id, profile_id, member_type, display_name)
     values ('${household}', '${PARTNER}', 'adult', 'Upasana') returning id;`,
    options,
  );
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);

  // Written as the server writes it: the service role, after its own checks.
  correction = psql(
    `insert into public.ai_corrections (household_id, surface, source_type, error_type, field, model_value, human_value, understanding_source, prompt_version, corrected_by_member_id)
     values ('${household}', 'hometalk', 'conversation_action', 'false_entity_match', 'memberName', 'Asmi', 'Manan', 'model', 'p-fbca759c77b2', '${headMember}') returning id;`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("the household's admin can read its correction evidence", () => {
  assert.equal(asProfile(HEAD, `select human_value from public.ai_corrections where id = '${correction}';`, options), "Manan");
});

test("another adult in the household who is not an admin cannot", () => {
  assert.equal(asProfile(PARTNER, `select count(*) from public.ai_corrections;`, options), "0");
});

test("another household cannot", () => {
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.ai_corrections;`, options), "0");
});

test("no member can write evidence — only the server records it", () => {
  assert.ok(
    deniedForProfile(
      HEAD,
      `insert into public.ai_corrections (household_id, surface, source_type, error_type, field) values ('${household}', 'hometalk', 'conversation_action', 'wrong_date', 'when');`,
      options,
    ),
    "a member could plant correction evidence",
  );
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `insert into public.ai_corrections (household_id, surface, source_type, error_type, field) values ('${otherHousehold}', 'hometalk', 'conversation_action', 'wrong_date', 'when');`,
      options,
    ),
    "a member could write evidence even for their own household",
  );
});

test("no member can change or remove evidence", () => {
  assert.ok(deniedForProfile(HEAD, `update public.ai_corrections set human_value = 'Asmi' where id = '${correction}';`, options));
  assert.ok(deniedForProfile(HEAD, `delete from public.ai_corrections where id = '${correction}';`, options));
  assert.equal(psql(`select human_value from public.ai_corrections where id = '${correction}';`, options), "Manan");
});

test("evidence is append-only even for the server", () => {
  assert.throws(() => psql(`update public.ai_corrections set human_value = 'Asmi' where id = '${correction}';`, options), /append-only/);
});

test("only closed words are accepted for what kind of mistake it was", () => {
  assert.throws(() =>
    psql(`insert into public.ai_corrections (household_id, surface, source_type, error_type, field) values ('${household}', 'hometalk', 'conversation_action', 'model was sad', 'when');`, options),
  );
  assert.throws(() =>
    psql(`insert into public.ai_corrections (household_id, surface, source_type, error_type, field) values ('${household}', 'nowhere', 'conversation_action', 'wrong_date', 'when');`, options),
  );
});

test("an approval fingerprint only ever has the server's shape", () => {
  const session = psql(`insert into public.conversation_sessions (household_id, member_id, channel) values ('${household}', '${headMember}', 'text') returning id;`, options);
  assert.throws(() =>
    psql(
      `insert into public.conversation_actions (household_id, session_id, action_type, payload, approval_fingerprint) values ('${household}', '${session}', 'make_payment', '{}'::jsonb, 'anything');`,
      options,
    ),
  );
  assert.match(
    psql(
      `insert into public.conversation_actions (household_id, session_id, action_type, payload, approval_fingerprint) values ('${household}', '${session}', 'make_payment', '{}'::jsonb, 'fp-0123456789abcdef') returning approval_fingerprint;`,
      options,
    ),
    /^fp-0123456789abcdef$/,
  );
});

test("the evidence goes with the household when the household is deleted", () => {
  psql(`delete from public.households where id = '${household}';`, options);
  assert.equal(psql(`select count(*) from public.ai_corrections where household_id = '${household}';`, options), "0");
});
