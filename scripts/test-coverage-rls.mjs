#!/usr/bin/env node
/**
 * RLS coverage, as a standing gate (SEC-10).
 *
 * Against a fresh database built from supabase/migrations: every table in an
 * app schema has row-level security on and a policy (a deny-all
 * `*_no_client_access` policy for service-role-only tables); no policy calls a
 * per-row helper or a bare auth.uid(); nothing is open to anon; every
 * SECURITY DEFINER function pins its search_path and is not callable by anon.
 * Known gaps sit in scripts/lib/rls-coverage-config.mjs and fail only when
 * they grow (or when one is fixed and left behind).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { psql } from "./lib/db.mjs";
import { findViolations, gatherFacts, hasBareUid, judge } from "./lib/rls-coverage.mjs";
import { ALLOW, BASELINE } from "./lib/rls-coverage-config.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_rls_coverage_test";
const options = { database: DB };

const facts = (over = {}) => ({ tables: [], policies: [], functions: [], ...over });
const table = (name, over = {}) => ({ name, rls: true, policies: 1, anonPrivileges: [], ...over });
const policy = (name, over = {}) => ({ name, roles: ["authenticated"], cmd: "SELECT", qual: "(x in (select wh.member_households()))", withCheck: null, ...over });
const fn = (name, over = {}) => ({ name, hasSearchPath: true, anonExecute: false, anonReachable: false, ...over });
const keys = (f) => [...findViolations(f).keys()];

describe("the checks, on synthetic facts", () => {
  test("a clean schema has no violations", () => {
    assert.deepEqual(keys(facts({ tables: [table("public.a")], policies: [policy("public.a.p")], functions: [fn("wh.f")] })), []);
  });

  test("a table without RLS, or with RLS and no policy, is flagged", () => {
    assert.deepEqual(keys(facts({ tables: [table("public.a", { rls: false })] })), ["no-rls:public.a"]);
    assert.deepEqual(keys(facts({ tables: [table("public.b", { policies: 0 })] })), ["no-policy:public.b"]);
  });

  test("per-row helpers and bare auth.uid() are flagged; the wrapped form is not", () => {
    const bad = (qual) => keys(facts({ policies: [policy("public.t.p", { qual })] }));
    assert.deepEqual(bad("wh.is_member(household_id)"), ["row-helper:public.t.p"]);
    assert.deepEqual(bad("(member_id = wh.member_id(household_id))"), ["row-helper:public.t.p"]);
    assert.deepEqual(bad("(id = auth.uid())"), ["bare-uid:public.t.p"]);
    assert.deepEqual(bad("(id = ( SELECT auth.uid() AS uid))"), []);
    assert.deepEqual(bad("(id = (select auth.uid()))"), []);
    assert.equal(hasBareUid("(select auth.uid()) = a and b = auth.uid()"), true);
  });

  test("open and anon-facing policies are flagged; a deny-all for anon is not", () => {
    const deny = policy("public.t.no", { roles: ["anon", "authenticated"], cmd: "ALL", qual: "false" });
    assert.deepEqual(keys(facts({ policies: [deny] })), []);
    assert.deepEqual(keys(facts({ policies: [policy("public.t.open", { qual: "true" })] })), ["open-policy:public.t.open"]);
    assert.deepEqual(keys(facts({ policies: [policy("public.t.a", { roles: ["anon"], qual: "(x = 1)" })] })), ["anon-policy:public.t.a"]);
  });

  test("anon table grants and SECURITY DEFINER functions are flagged", () => {
    assert.deepEqual(keys(facts({ tables: [table("public.a", { anonPrivileges: ["select"] })] })), ["anon-table-grant:public.a"]);
    assert.deepEqual(keys(facts({ functions: [fn("wh.f", { hasSearchPath: false })] })), ["secdef-search-path:wh.f"]);
    assert.deepEqual(keys(facts({ functions: [fn("public.g", { anonExecute: true, anonReachable: true })] })), ["anon-reachable-secdef:public.g"]);
    assert.deepEqual(keys(facts({ functions: [fn("wh.h", { anonExecute: true })] })), ["anon-execute-secdef:wh.h"]);
  });
});

describe("allow and baseline logic", () => {
  const v = new Map([["no-rls:public.a", "a"], ["row-helper:public.t.p", "b"]]);
  test("new violations fail; allowed and baselined ones do not", () => {
    assert.equal(judge(v, { allow: { "no-rls:public.a": "reason" }, baseline: { "row-helper:public.t.p": "SEC-xx" } }).fresh.length, 0);
    assert.equal(judge(v, { allow: {}, baseline: { "row-helper:public.t.p": "SEC-xx" } }).fresh.length, 1);
  });
  test("a fixed baseline or allow entry is stale and an entry with no reason is rejected", () => {
    const r = judge(new Map(), { allow: { "no-rls:gone": "r" }, baseline: { "no-rls:fixed": "SEC-xx", "no-rls:blank": " " } });
    assert.deepEqual(r.stale.sort(), ["no-rls:blank", "no-rls:fixed"]);
    assert.deepEqual(r.staleAllow, ["no-rls:gone"]);
    assert.deepEqual(r.unexplained, ["no-rls:blank"]);
  });
});

describe("the real schema", () => {
  before(() => buildTestDatabase(DB));
  after(() => psql(`drop database if exists ${DB}`, { database: "postgres" }));

  test("only reviewed exceptions and the documented baseline violate", () => {
    const r = judge(findViolations(gatherFacts(options)), { allow: ALLOW, baseline: BASELINE });
    assert.deepEqual(r.fresh, [], "new RLS coverage violations");
    assert.deepEqual(r.stale, [], "fixed: remove these from BASELINE in scripts/lib/rls-coverage-config.mjs");
    assert.deepEqual(r.staleAllow, [], "no longer needed: remove these from ALLOW");
    assert.deepEqual(r.unexplained, [], "every entry needs a reason");
  });

  test("negative: a new table with no RLS, or RLS and no policy, fails the gate", () => {
    psql(`create table public.zz_scratch_no_rls (id uuid primary key); create table public.zz_scratch_no_policy (id uuid primary key); alter table public.zz_scratch_no_policy enable row level security;`, options);
    const r = judge(findViolations(gatherFacts(options)), { allow: ALLOW, baseline: BASELINE });
    const text = r.fresh.join("\n");
    assert.match(text, /no-rls:public\.zz_scratch_no_rls/);
    assert.match(text, /no-policy:public\.zz_scratch_no_policy/);
  });
});
