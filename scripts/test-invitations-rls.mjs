#!/usr/bin/env node
/**
 * Invitation authorization tests (story 01-002).
 *
 * An invitation is a capability: whoever holds the token joins the household.
 * The rules that make that safe — expiry, revocation, single use, supersession
 * on re-invite, and administrators only — are asserted here against the real
 * policies and the real acceptance function.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_invitations_test";
const options = { database: DB };

const HEAD = "11111111-1111-4111-8111-111111111111";
const INVITEE = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

let household = "";
let headMember = "";

/** Mirrors the application's token handling: store only the digest. */
function digest(token) {
  return psql(`select encode(digest('${token}', 'sha256'), 'hex');`, options);
}

function invite(token, { expiresIn = "7 days", email = "priya@example.test", role = "adult" } = {}) {
  return psql(
    `insert into public.household_invitations
       (household_id, invited_by_member_id, email, display_name, role, token_hash, expires_at)
     values ('${household}', '${headMember}', '${email}', 'Priya', '${role}',
             '${digest(token)}', now() + interval '${expiresIn}')
     returning id;`,
    options,
  );
}

before(() => {
  buildTestDatabase(DB);
  psql(`create extension if not exists pgcrypto;`, options);
  psql(
    `insert into auth.users (id, email) values
       ('${HEAD}', 'kunal@example.test'),
       ('${INVITEE}', 'priya@example.test'),
       ('${OUTSIDER}', 'outsider@example.test');`,
    options,
  );

  [household, headMember] = asProfile(
    HEAD,
    `select household_id || ' ' || member_id from wh.create_household('Chakraborty Home', 'Kunal');`,
    options,
  ).split(" ");
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

test("a valid invitation admits the invitee as a member", () => {
  const token = "token-valid-0000000000000000000000000";
  invite(token);

  const result = asProfile(
    INVITEE,
    `select household_id from wh.accept_invitation('${digest(token)}', 'Priya');`,
    options,
  );
  assert.equal(result, household);

  const member = psql(
    `select count(*) from public.household_members
     where household_id = '${household}' and profile_id = '${INVITEE}';`,
    options,
  );
  assert.equal(member, "1");
});

test("the accepted invitation cannot be used a second time", () => {
  const token = "token-single-use-00000000000000000000";
  invite(token, { email: "second@example.test" });

  asProfile(INVITEE, `select wh.accept_invitation('${digest(token)}');`, options);

  assert.ok(
    deniedForProfile(OUTSIDER, `select wh.accept_invitation('${digest(token)}');`, options),
    "an accepted invitation was reusable",
  );
});

test("an expired invitation does not create membership", () => {
  const token = "token-expired-000000000000000000000";
  invite(token, { expiresIn: "-1 hour", email: "expired@example.test" });

  assert.ok(
    deniedForProfile(OUTSIDER, `select wh.accept_invitation('${digest(token)}');`, options),
    "an expired invitation was accepted",
  );
  assert.equal(
    psql(
      `select count(*) from public.household_members
       where household_id = '${household}' and profile_id = '${OUTSIDER}';`,
      options,
    ),
    "0",
  );
});

test("a revoked invitation does not create membership", () => {
  const token = "token-revoked-000000000000000000000";
  const id = invite(token, { email: "revoked@example.test" });
  psql(`update public.household_invitations set revoked_at = now() where id = '${id}';`, options);

  assert.ok(
    deniedForProfile(OUTSIDER, `select wh.accept_invitation('${digest(token)}');`, options),
    "a revoked invitation was accepted",
  );
});

test("an unknown token is refused exactly like a revoked one", () => {
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `select wh.accept_invitation('${"0".repeat(64)}');`,
      options,
    ),
    "an unknown token was accepted",
  );
});

test("only one live invitation per address can exist at a time", () => {
  const first = "token-supersede-a-0000000000000000000";
  invite(first, { email: "dup@example.test" });

  let rejected = false;
  try {
    invite("token-supersede-b-0000000000000000000", { email: "dup@example.test" });
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "a second live invitation was created for the same address");
});

test("a non-administrator cannot invite anyone", () => {
  assert.ok(
    deniedForProfile(
      OUTSIDER,
      `insert into public.household_invitations
         (household_id, invited_by_member_id, email, display_name, role, token_hash, expires_at)
       values ('${household}', '${headMember}', 'sneaky@example.test', 'Sneaky', 'adult',
               'deadbeef', now() + interval '7 days');`,
      options,
    ),
    "a non-member created an invitation",
  );
});

test("a member cannot read another household's invitations", () => {
  const [otherHousehold] = asProfile(
    OUTSIDER,
    `select household_id || ' ' || member_id from wh.create_household('Outsider Home', 'Outsider');`,
    options,
  ).split(" ");

  assert.equal(
    asProfile(
      OUTSIDER,
      `select count(*) from public.household_invitations where household_id = '${household}';`,
      options,
    ),
    "0",
  );
  assert.notEqual(otherHousehold, household);
});

test("accepting an invitation is audited", () => {
  const events = asProfile(
    HEAD,
    `select count(*) from public.audit_events
     where household_id = '${household}' and event_type = 'invitation.accepted';`,
    options,
  );
  assert.ok(Number(events) >= 1, `expected at least one acceptance audit event, saw ${events}`);
});

test("an anonymous caller cannot accept an invitation", () => {
  const token = "token-anon-00000000000000000000000000";
  invite(token, { email: "anon@example.test" });

  let rejected = false;
  try {
    psql(
      `set role anon;
       select wh.accept_invitation('${digest(token)}');`,
      options,
    );
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "an anonymous caller accepted an invitation");
});
