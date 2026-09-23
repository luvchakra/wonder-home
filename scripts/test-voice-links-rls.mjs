#!/usr/bin/env node
/**
 * Voice integration phase 2 at the database: linked voice identities and
 * the OAuth grants behind them.
 *
 * - A member sees their own links; a household admin sees every link in the
 *   household; another household sees none.
 * - No session creates, widens, reassigns or deletes a link — the server
 *   creates it after consent, and a person only ever revokes it.
 * - Revoking goes through public.revoke_voice_identity: the member whose
 *   link it is, or an admin; it stops every grant at once and keeps the row.
 * - The grants table (hashed codes and tokens) is unreadable to every session.
 * - A link can only name a member of its own household.
 * - The live-engine choice (Gemini Voice, phase 3) is an admin's preference,
 *   readable by every member, and only a known engine.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, deniedForUpdate, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_voice_links_test";
const options = { database: DB };

const HEAD = "51111111-1111-4111-8111-111111111111";
const PARTNER = "52222222-2222-4222-8222-222222222222";
const OUTSIDER = "53333333-3333-4333-8333-333333333333";
const HASH = (n) => String(n).repeat(64).slice(0, 64);

let household = "";
let otherHousehold = "";
let headMember = "";
let partnerMember = "";
let outsiderMember = "";
let partnerLink = "";
let headLink = "";

const link = (householdId, memberId, scopes = "{household.read,groceries.write}") =>
  psql(`insert into public.external_voice_identities (household_id, member_id, provider, scopes) values ('${householdId}', '${memberId}', 'amazon_alexa', '${scopes}') returning id;`, options);

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${HEAD}', 'kunal@example.test'), ('${PARTNER}', 'upasana@example.test'), ('${OUTSIDER}', 'arjun@example.test');`, options);
  [household, headMember] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Mehta Home', 'Kunal');`, options).split(" ");
  [otherHousehold, outsiderMember] = asProfile(OUTSIDER, `select household_id || ' ' || member_id from wh.create_household('Arjun Home', 'Arjun');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${PARTNER}', 'Upasana');`, options);
  partnerMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${PARTNER}', 'adult', 'Upasana') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${partnerMember}', 'adult');`, options);

  // As the server writes them: after consent, with the service role.
  partnerLink = link(household, partnerMember);
  headLink = link(household, headMember);
  psql(
    `insert into public.voice_oauth_grants (household_id, identity_id, kind, token_hash, client_id, expires_at)
     values ('${household}', '${partnerLink}', 'access', '${HASH(1)}', 'alexa', now() + interval '1 hour'),
            ('${household}', '${partnerLink}', 'refresh', '${HASH(2)}', 'alexa', now() + interval '180 days');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a member sees their own links, an admin sees the household's, another household sees none", () => {
  assert.equal(asProfile(PARTNER, `select count(*) from public.external_voice_identities;`, options), "1");
  assert.equal(asProfile(PARTNER, `select id from public.external_voice_identities;`, options), partnerLink);
  assert.equal(asProfile(HEAD, `select count(*) from public.external_voice_identities;`, options), "2");
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.external_voice_identities;`, options), "0");
});

test("no session creates, widens, reassigns or deletes a link", () => {
  assert.ok(deniedForProfile(PARTNER, `insert into public.external_voice_identities (household_id, member_id, provider) values ('${household}', '${partnerMember}', 'gemini');`, options), "a member created a link without consent flow");
  asProfile(PARTNER, `update public.external_voice_identities set scopes = '{health.read,bills.read}', member_id = '${headMember}' where id = '${partnerLink}';`, options);
  assert.equal(psql(`select member_id || ' ' || array_to_string(scopes, ',') from public.external_voice_identities where id = '${partnerLink}';`, options), `${partnerMember} household.read,groceries.write`);
  asProfile(HEAD, `delete from public.external_voice_identities where id = '${partnerLink}';`, options);
  assert.equal(psql(`select count(*) from public.external_voice_identities where id = '${partnerLink}';`, options), "1");
});

test("the grants table is unreadable and unwritable to every session", () => {
  assert.equal(asProfile(PARTNER, `select count(*) from public.voice_oauth_grants;`, options), "0");
  assert.equal(asProfile(HEAD, `select count(*) from public.voice_oauth_grants;`, options), "0");
  assert.ok(deniedForProfile(PARTNER, `insert into public.voice_oauth_grants (household_id, identity_id, kind, token_hash, client_id, expires_at) values ('${household}', '${partnerLink}', 'access', '${HASH(3)}', 'x', now() + interval '1 hour');`, options));
});

test("a link can only name a member of its own household, and only known scopes", () => {
  assert.throws(() => link(household, outsiderMember), /not in household/);
  assert.throws(() => link(household, partnerMember, "{admin.everything}"));
  assert.throws(() => psql(`insert into public.voice_oauth_grants (household_id, identity_id, kind, token_hash, client_id, expires_at) values ('${household}', '${partnerLink}', 'access', 'not-a-hash', 'x', now());`, options));
});

test("another member cannot revoke someone's link; an outsider cannot either", () => {
  assert.ok(deniedForProfile(PARTNER, `select public.revoke_voice_identity('${headLink}');`, options), "a member revoked someone else's link");
  assert.ok(deniedForProfile(OUTSIDER, `select public.revoke_voice_identity('${partnerLink}');`, options), "another household revoked a link");
  assert.equal(psql(`select status from public.external_voice_identities where id = '${headLink}';`, options), "active");
});

test("the member revokes their own link: every grant stops at once, the row and the household's data stay", () => {
  assert.equal(asProfile(PARTNER, `select public.revoke_voice_identity('${partnerLink}');`, options), "t");
  assert.equal(psql(`select status || ' ' || (revoked_at is not null) from public.external_voice_identities where id = '${partnerLink}';`, options), "revoked true");
  assert.equal(psql(`select count(*) from public.voice_oauth_grants where identity_id = '${partnerLink}' and revoked_at is null;`, options), "0");
  assert.equal(psql(`select count(*) from public.household_members where id = '${partnerMember}';`, options), "1");
  // Idempotent: revoking again is still a yes.
  assert.equal(asProfile(PARTNER, `select public.revoke_voice_identity('${partnerLink}');`, options), "t");
});

test("an admin revokes any link in the household; the anonymous role cannot call it at all", () => {
  assert.equal(asProfile(HEAD, `select public.revoke_voice_identity('${headLink}');`, options), "t");
  assert.equal(psql(`select status from public.external_voice_identities where id = '${headLink}';`, options), "revoked");
  assert.throws(() => psql(`set role anon; select public.revoke_voice_identity('${headLink}');`, options));
});

test("an active provider account links to one member at a time", () => {
  const first = link(otherHousehold, outsiderMember);
  psql(`update public.external_voice_identities set provider_subject = 'amzn1.account.X' where id = '${first}';`, options);
  const second = link(otherHousehold, outsiderMember);
  assert.throws(() => psql(`update public.external_voice_identities set provider_subject = 'amzn1.account.X' where id = '${second}';`, options), /duplicate key/);
});

test("Gemini Voice's live-engine choice is an admin's preference, and only a known engine (voice phase 3)", () => {
  // Every existing household keeps WonderHome's own live loop.
  asProfile(HEAD, `insert into public.household_voice_settings (household_id) values ('${household}');`, options);
  assert.equal(psql(`select live_engine from public.household_voice_settings where household_id = '${household}';`, options), "wonderhome");
  asProfile(HEAD, `update public.household_voice_settings set live_engine = 'gemini_live' where household_id = '${household}';`, options);
  assert.equal(asProfile(PARTNER, `select live_engine from public.household_voice_settings where household_id = '${household}';`, options), "gemini_live");
  assert.ok(
    deniedForUpdate(PARTNER, `update public.household_voice_settings set live_engine = 'wonderhome' where household_id = '${household}';`, `select live_engine from public.household_voice_settings where household_id = '${household}';`, "gemini_live", options),
    "a member who is not an admin changed the live engine",
  );
  assert.throws(() => asProfile(HEAD, `update public.household_voice_settings set live_engine = 'some_other_engine' where household_id = '${household}';`, options), /check constraint/);
  assert.equal(asProfile(OUTSIDER, `select count(*) from public.household_voice_settings where household_id = '${household}';`, options), "0");
});

test("channel telemetry is unreadable and unwritable to every session (voice phase 6)", () => {
  psql(`insert into public.hometalk_channel_events (household_id, channel, outcome, latency_ms) values ('${household}', 'alexa', 'completed', 120);`, options);
  assert.equal(asProfile(HEAD, `select count(*) from public.hometalk_channel_events;`, options), "0");
  assert.equal(asProfile(PARTNER, `select count(*) from public.hometalk_channel_events;`, options), "0");
  assert.ok(deniedForProfile(HEAD, `insert into public.hometalk_channel_events (household_id, channel, outcome) values ('${household}', 'web', 'answered');`, options), "a member wrote telemetry");
  assert.throws(() => psql(`insert into public.hometalk_channel_events (channel, outcome) values ('telegram', 'answered');`, options));
  assert.throws(() => psql(`insert into public.hometalk_channel_events (channel, outcome) values ('web', 'transcript: buy milk');`, options));
});

test("a conversation belongs to one surface, and only a known one (voice phase 5)", () => {
  // Sessions are opened by the server; every one that says nothing is the app's.
  assert.equal(psql(`insert into public.conversation_sessions (household_id, member_id, channel) values ('${household}', '${headMember}', 'text') returning surface;`, options), "app");
  assert.ok(deniedForProfile(HEAD, `insert into public.conversation_sessions (household_id, member_id, channel, surface) values ('${household}', '${headMember}', 'voice', 'alexa');`, options), "a member opened a session directly");
  assert.throws(() => psql(`insert into public.conversation_sessions (household_id, member_id, channel, surface) values ('${household}', '${headMember}', 'voice', 'telegram');`, options));
  assert.equal(psql(`insert into public.conversation_sessions (household_id, member_id, channel, surface) values ('${household}', '${headMember}', 'voice', 'alexa') returning surface;`, options), "alexa");
});
