#!/usr/bin/env node
/**
 * Members sign in as themselves (member sign-in by email).
 *
 * An Admin records a member's sign-in email; only Admins and that member read
 * it, only an Admin writes it. A verified sign-in with that email links the
 * account to the member, keeping the role the household gave them — a child
 * stays a child. An unverified email links nothing, a removed member is not
 * brought back, and nobody joins a household they were not recorded in. An
 * invitation for a member on record (the Invite button) links to that member
 * with their own role, may carry no email, and never creates a child.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_member_sign_in_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111"; // Admin
const ASHA = "22222222-2222-4222-8222-222222222222"; // adult with an account
const KID = "33333333-3333-4333-8333-333333333333"; // the child, signing in
const SUNITA = "44444444-4444-4444-8444-444444444444"; // the helper, unverified
const STRANGER = "55555555-5555-4555-8555-555555555555";
const GONE = "66666666-6666-4666-8666-666666666666"; // a removed member's email

let household = "";
let ashaMember = "";
let childMember = "";
let helperMember = "";
let goneMember = "";

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email, email_confirmed_at) values
       ('${OWNER}', 'owner@example.test', now()), ('${ASHA}', 'asha@example.test', now()),
       ('${KID}', 'anya@example.test', now()), ('${SUNITA}', 'sunita@example.test', null),
       ('${STRANGER}', 'stranger@example.test', now()), ('${GONE}', 'gone@example.test', now());`,
    options,
  );
  [household] = asProfile(OWNER, `select household_id || ' ' || member_id from wh.create_household('Sharma Home', 'Kunal');`, options).split(" ");
  psql(`insert into public.profiles (id, display_name) values ('${ASHA}', 'Asha');`, options);
  ashaMember = psql(`insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${ASHA}', 'adult', 'Asha') returning id;`, options);
  childMember = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'child', 'Anya') returning id;`, options);
  helperMember = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'helper', 'Sunita') returning id;`, options);
  goneMember = psql(`insert into public.household_members (household_id, member_type, display_name, status) values ('${household}', 'adult', 'Old', 'inactive') returning id;`, options);
  psql(
    `insert into public.household_roles (household_id, member_id, role) values
       ('${household}', '${ashaMember}', 'adult'), ('${household}', '${childMember}', 'child'), ('${household}', '${helperMember}', 'helper');`,
    options,
  );
});

after(() => {
  psql(`drop database if exists ${DB}`, { database: "postgres" });
});

const setEmail = (profile, member, email) =>
  asProfile(profile, `insert into public.household_member_emails (member_id, household_id, email) values ('${member}', '${household}', '${email}') returning member_id;`, options);

test("only an Admin records a member's sign-in email", () => {
  assert.equal(setEmail(OWNER, childMember, "anya@example.test"), childMember);
  setEmail(OWNER, helperMember, "sunita@example.test");
  setEmail(OWNER, goneMember, "gone@example.test");
  assert.ok(deniedForProfile(ASHA, `insert into public.household_member_emails (member_id, household_id, email) values ('${ashaMember}', '${household}', 'asha2@example.test');`, options));
  assert.ok(deniedForProfile(STRANGER, `insert into public.household_member_emails (member_id, household_id, email) values ('${ashaMember}', '${household}', 'x@example.test');`, options));
});

test("an email is stored as written by the rules: lower case, one per household", () => {
  assert.ok(deniedForProfile(OWNER, `insert into public.household_member_emails (member_id, household_id, email) values ('${ashaMember}', '${household}', 'Asha@Example.test');`, options));
  assert.ok(deniedForProfile(OWNER, `insert into public.household_member_emails (member_id, household_id, email) values ('${ashaMember}', '${household}', 'anya@example.test');`, options));
});

test("Admins read every member's email; another member reads none but their own", () => {
  assert.equal(asProfile(OWNER, `select count(*) from public.household_member_emails;`, options), "3");
  assert.equal(asProfile(ASHA, `select count(*) from public.household_member_emails;`, options), "0");
  assert.equal(asProfile(STRANGER, `select count(*) from public.household_member_emails;`, options), "0");
});

test("a verified sign-in with the recorded email becomes that member, and a child stays a child", () => {
  assert.equal(asProfile(KID, `select member_id from public.claim_members_by_email();`, options), childMember);
  assert.equal(psql(`select profile_id from public.household_members where id = '${childMember}';`, options), KID);
  assert.equal(asProfile(KID, `select string_agg(role, ',') from public.household_roles where member_id = '${childMember}';`, options), "child");
  // And now reads the household as that member, and their own email.
  assert.equal(asProfile(KID, `select count(*) from public.households where id = '${household}';`, options), "1");
  assert.equal(asProfile(KID, `select count(*) from public.household_member_emails;`, options), "1");
  // Doing it again changes nothing.
  assert.equal(asProfile(KID, `select count(*) from public.claim_members_by_email();`, options), "0");
});

test("an unverified email links nothing", () => {
  assert.equal(asProfile(SUNITA, `select count(*) from public.claim_members_by_email();`, options), "0");
  assert.equal(psql(`select profile_id is null from public.household_members where id = '${helperMember}';`, options), "t");
});

test("a removed member is not brought back by signing in, and a stranger joins nothing", () => {
  assert.equal(asProfile(GONE, `select count(*) from public.claim_members_by_email();`, options), "0");
  assert.equal(asProfile(STRANGER, `select count(*) from public.claim_members_by_email();`, options), "0");
  assert.equal(asProfile(STRANGER, `select count(*) from public.households where id = '${household}';`, options), "0");
});

test("the link is recorded", () => {
  assert.equal(psql(`select count(*) from public.audit_events where event_type = 'member.signed_in_by_email' and target_id = '${childMember}';`, options), "1");
});

test("an invitation for the helper on record, shared with no email, links to her with her own role", () => {
  const ownerMember = psql(`select id from public.household_members where household_id = '${household}' and profile_id = '${OWNER}';`, options);
  asProfile(
    OWNER,
    `insert into public.household_invitations (household_id, invited_by_member_id, email, member_type, role, display_name, token_hash, expires_at, member_id)
     values ('${household}', '${ownerMember}', null, 'helper', 'helper', 'Sunita', 'hash-sunita', now() + interval '7 days', '${helperMember}') returning id;`,
    options,
  );
  assert.equal(asProfile(SUNITA, `select member_id from public.accept_invitation('hash-sunita');`, options), helperMember);
  assert.equal(psql(`select string_agg(role, ',') from public.household_roles where member_id = '${helperMember}';`, options), "helper");
});

test("a child invitation must name the child, and is never turned into a new member", () => {
  const ownerMember = psql(`select id from public.household_members where household_id = '${household}' and profile_id = '${OWNER}';`, options);
  assert.ok(
    deniedForProfile(
      OWNER,
      `insert into public.household_invitations (household_id, invited_by_member_id, email, member_type, role, display_name, token_hash, expires_at)
       values ('${household}', '${ownerMember}', 'kid2@example.test', 'child', 'child', 'Kid', 'hash-kid2', now() + interval '7 days');`,
      options,
    ),
  );
  // An invitation to Anya, who has already signed in, cannot make a second child.
  asProfile(
    OWNER,
    `insert into public.household_invitations (household_id, invited_by_member_id, email, member_type, role, display_name, token_hash, expires_at, member_id)
     values ('${household}', '${ownerMember}', null, 'child', 'child', 'Anya', 'hash-anya', now() + interval '7 days', '${childMember}') returning id;`,
    options,
  );
  assert.ok(deniedForProfile(STRANGER, `select * from public.accept_invitation('hash-anya');`, options));
  assert.equal(psql(`select count(*) from public.household_members where household_id = '${household}' and member_type = 'child';`, options), "1");
});
