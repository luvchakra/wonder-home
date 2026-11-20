#!/usr/bin/env node
/**
 * Story 01-015: a member's contact email and phone (owner, 2026-11-20).
 *
 * The member themselves and any Admin write them. Admins and the member read
 * them; the household's adults read an adult's or a helper's; a child's are
 * read by their guardians and Admins, never by another adult; a child reads
 * only their own. They are not the sign-in identity: a verified phone equal to
 * a contact phone links nothing.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { asProfile, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_member_contacts_test";
const options = { database: DB };

const OWNER = "11111111-1111-4111-8111-111111111111"; // Admin
const ASHA = "22222222-2222-4222-8222-222222222222"; // adult, the child's guardian
const RAVI = "66666666-6666-4666-8666-666666666666"; // adult, not a guardian
const KID = "33333333-3333-4333-8333-333333333333"; // a child with an account
const SUNITA = "44444444-4444-4444-8444-444444444444"; // a verified phone, never on record as a sign-in phone

let household = "";
let ownerMember = "";
let ashaMember = "";
let raviMember = "";
let kidMember = "";
let helperMember = "";

const contact = (member, email, phone) =>
  `insert into public.household_member_contacts (member_id, household_id, email, phone) values ('${member}', '${household}', ${email ? `'${email}'` : "null"}, ${phone ? `'${phone}'` : "null"});`;
const seen = (profile) => asProfile(profile, `select coalesce(string_agg(member_id::text, ',' order by member_id), '') from public.household_member_contacts;`, options).split(",").filter(Boolean).sort();

before(() => {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
       ('${OWNER}', 'owner@example.test', now(), null, null),
       ('${ASHA}', 'asha@example.test', now(), null, null),
       ('${RAVI}', 'ravi@example.test', now(), null, null),
       ('${KID}', 'kid@example.test', now(), null, null),
       ('${SUNITA}', null, null, '919876543210', now());`,
    options,
  );
  household = asProfile(OWNER, `select household_id from wh.create_household('Sharma Home', 'Kunal');`, options);
  ownerMember = psql(`select id from public.household_members where profile_id = '${OWNER}';`, options);
  const adult = (id, name) => {
    const member = psql(`insert into public.profiles (id, display_name) values ('${id}', '${name}'); insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${id}', 'adult', '${name}') returning id;`, options);
    psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${member}', 'adult');`, options);
    return member;
  };
  ashaMember = adult(ASHA, "Asha");
  raviMember = adult(RAVI, "Ravi");
  kidMember = psql(`insert into public.profiles (id, display_name) values ('${KID}', 'Anya'); insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${household}', '${KID}', 'child', 'Anya') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${kidMember}', 'child');`, options);
  psql(`insert into public.member_guardians (household_id, child_member_id, guardian_member_id) values ('${household}', '${kidMember}', '${ashaMember}');`, options);
  helperMember = psql(`insert into public.household_members (household_id, member_type, display_name) values ('${household}', 'helper', 'Sunita') returning id;`, options);
  psql(`insert into public.household_roles (household_id, member_id, role) values ('${household}', '${helperMember}', 'helper');`, options);
});

test("a member writes their own; an Admin writes anyone's; nobody else", () => {
  // Before anyone has a row: another adult and a child are refused someone else's.
  assert.ok(deniedForProfile(RAVI, contact(helperMember, null, "+919811111111"), options));
  assert.ok(deniedForProfile(KID, contact(ashaMember, "kid-wrote@example.com", null), options));
  asProfile(ASHA, contact(ashaMember, "asha@example.com", "+919800000001"), options);
  asProfile(KID, contact(kidMember, null, "+919800000002"), options);
  asProfile(OWNER, contact(helperMember, null, "+919876543210"), options);
  asProfile(OWNER, contact(ownerMember, "owner@example.com", null), options);
  // An update to someone else's row changes nothing.
  asProfile(RAVI, `update public.household_member_contacts set email = 'ravi-was-here@example.com' where member_id = '${ashaMember}';`, options);
  assert.equal(psql(`select email from public.household_member_contacts where member_id = '${ashaMember}';`, options), "asha@example.com");
  // An Admin changes anyone's.
  asProfile(OWNER, `update public.household_member_contacts set email = 'asha.s@example.com' where member_id = '${ashaMember}';`, options);
  assert.equal(psql(`select email from public.household_member_contacts where member_id = '${ashaMember}';`, options), "asha.s@example.com");
});

test("only an email's shape and an E.164 number are kept", () => {
  assert.throws(() => asProfile(RAVI, contact(raviMember, "not an email", null), options));
  assert.throws(() => asProfile(RAVI, contact(raviMember, null, "98765 43210"), options));
});

test("Admins see everyone's; an adult sees adults' and helpers', and a child's only as their guardian; a child sees their own", () => {
  assert.deepEqual(seen(OWNER), [ownerMember, ashaMember, kidMember, helperMember].sort());
  assert.deepEqual(seen(ASHA), [ownerMember, ashaMember, kidMember, helperMember].sort());
  assert.deepEqual(seen(RAVI), [ownerMember, ashaMember, helperMember].sort());
  assert.deepEqual(seen(KID), [kidMember]);
});

test("a contact phone is not a sign-in phone: a verified sign-in with it links nobody", () => {
  assert.equal(asProfile(SUNITA, `select count(*) from public.claim_members_by_phone();`, options), "0");
  assert.equal(psql(`select coalesce(profile_id::text, 'none') from public.household_members where id = '${helperMember}';`, options), "none");
});
