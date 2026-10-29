#!/usr/bin/env node
/**
 * PERF-02 equivalence proof: consolidating the overlapping permissive RLS
 * policies changed NOTHING about who can read or write any row.
 *
 * The advisor flagged 63 cases where, for one {table, role, command}, two or
 * more permissive policies were OR-evaluated per row. The migrations
 * (20261029{15..19}0000_perf02_consolidate_*.sql) collapse each such group
 * into a single policy whose USING / WITH CHECK is the exact OR of the
 * originals. Postgres already OR's permissive policies, so the set of rows
 * each role may read/write is unchanged — this test proves it two ways:
 *
 *  1. Predicate equivalence, over EVERY {table, role, command} (all rows, all
 *     roles). It builds one database from the migrations WITHOUT the perf02
 *     files ("before") and one WITH them ("after"), reads the real policies
 *     from each, and asserts that the single "after" policy's predicate is,
 *     after Postgres's own normalisation, identical to the OR of exactly the
 *     "before" policies that applied to that command — with the same command
 *     applicability (FOR ALL covers all four; a NULL WITH CHECK falls back to
 *     USING for INSERT/UPDATE) the planner itself uses. A dropped branch, a
 *     wrong command, a changed role or a stale migration file all fail here.
 *  2. A concrete before/after probe on representative tables: identical data
 *     seeded into both databases, then the visible row-id set and the
 *     allow/deny of insert/update/delete compared per role (admin, non-admin
 *     adult, outsider, anon). This catches the rule itself being wrong, not
 *     just the migration mis-encoding it.
 *
 * It also asserts the "after" schema has ZERO multiple-permissive-policy
 * groups (what the advisor will report → 0) and keeps the set-form helpers.
 *
 * usda_foods is the one group that is not a plain OR: its anon+authenticated
 * deny-all (USING false) overlapped the authenticated SELECT policy, and
 * `false OR x ≡ x`, so the migration drops the deny-all rather than OR-ing in
 * `false`. It is proven structurally (part 3) instead of by part 1.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { asAnonymous, asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SHIM = join(ROOT, "supabase/tests/supabase-shim.sql");
const PERF02 = /_perf02_consolidate_/;

const AFTER = process.env.WH_TEST_DB ?? "wonderhome_perf02_after_test";
const BEFORE = `${AFTER}_before`;
const aft = { database: AFTER };
const bef = { database: BEFORE };

const COMMANDS = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const usesUsing = (cmd) => cmd === "SELECT" || cmd === "UPDATE" || cmd === "DELETE";
const usesCheck = (cmd) => cmd === "INSERT" || cmd === "UPDATE";
// A policy's command list: FOR ALL covers every command.
const covers = (p, cmd) => p.cmd === "ALL" || p.cmd === cmd;
// For INSERT/UPDATE a NULL with_check falls back to the USING expression.
const checkOf = (p) => (p.with_check !== null ? p.with_check : p.qual);
const sortUniqOr = (exprs) => {
  const u = [...new Set(exprs.map((e) => e.trim()))].sort();
  return u.length ? u.map((e) => `(${e})`).join(" OR ") : null;
};

function runFile(database, file) {
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", database, "-f", file], { stdio: ["ignore", "pipe", "pipe"] });
}

/** Build the "before" database: the shim and every migration except perf02. */
function buildBeforeDatabase() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !PERF02.test(f)).sort();
  // A cached template keyed by the exact (shim + non-perf02 migrations) set.
  const hash = createHash("sha256");
  for (const f of [SHIM, ...files.map((f) => join(MIGRATIONS, f))]) hash.update(readFileSync(f)).update("\0");
  const tpl = `wh_tpl_perf02before_${hash.digest("hex").slice(0, 12)}`;
  const exists = (db) => psql(`select 1 from pg_database where datname='${db}'`, { database: "postgres" }) === "1";
  if (!exists(tpl)) {
    const building = `${tpl}_b${process.pid}`;
    psql(`drop database if exists ${building}`, { database: "postgres" });
    psql(`create database ${building}`, { database: "postgres" });
    runFile(building, SHIM);
    for (const f of files) runFile(building, join(MIGRATIONS, f));
    try {
      psql(`alter database ${building} rename to ${tpl}`, { database: "postgres" });
    } catch {
      psql(`drop database if exists ${building}`, { database: "postgres" });
    }
  }
  psql(`drop database if exists ${BEFORE}`, { database: "postgres" });
  psql(`create database ${BEFORE} template ${tpl}`, { database: "postgres" });
}

function policiesFor(options, tables) {
  const list = tables.map((t) => `'${t}'`).join(",");
  const rows = psql(
    `select coalesce(json_agg(json_build_object('tablename',tablename,'policyname',policyname,'cmd',cmd,'roles',roles,'qual',qual,'with_check',with_check)),'[]')
     from pg_policies where schemaname='public' and permissive='PERMISSIVE' and tablename in (${list})`,
    options,
  );
  return JSON.parse(rows);
}

/** Canonicalise a predicate by letting Postgres parse and re-render it. */
function canon(table, cmd, role, usingExpr, checkExpr) {
  let create = `create policy __eq_probe on public.${table} for ${cmd.toLowerCase()} to ${role}`;
  if (usingExpr) create += ` using (${usingExpr})`;
  if (checkExpr) create += ` with check (${checkExpr})`;
  const out = psql(
    `begin;\n${create};\nselect coalesce(qual,'')||'\u001f'||coalesce(with_check,'') from pg_policies where schemaname='public' and tablename='${table}' and policyname='__eq_probe';\nrollback;`,
    aft,
  );
  const [q, c] = out.split("\u001f");
  return { qual: q ?? "", check: c ?? "" };
}

// The tables the migrations consolidate (every one the advisor flagged).
let manifestTables = [];
let beforePolicies = [];
let afterPolicies = [];

before(() => {
  buildTestDatabase(AFTER);
  buildBeforeDatabase();
  // Authoritative list: the tables named in the perf02 migration files.
  const named = new Set();
  for (const f of readdirSync(MIGRATIONS).filter((f) => PERF02.test(f))) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    for (const m of sql.matchAll(/drop policy if exists \w+ on public\.(\w+);/g)) named.add(m[1]);
  }
  manifestTables = [...named].sort();
  beforePolicies = policiesFor(bef, manifestTables);
  afterPolicies = policiesFor(aft, manifestTables);
});

after(() => {
  psql(`drop database if exists ${AFTER}`, { database: "postgres" });
  psql(`drop database if exists ${BEFORE}`, { database: "postgres" });
});

describe("the migrations consolidate exactly the advisor-flagged tables", () => {
  test("every flagged table is covered (56)", () => {
    assert.equal(manifestTables.length, 56);
  });
});

describe("predicate equivalence over every {table, role, command}", () => {
  test("each 'after' policy is the exact OR of the 'before' policies it replaced", () => {
    const mismatches = [];
    for (const t of manifestTables) {
      if (t === "usda_foods") continue; // not a plain OR; proven structurally below
      const beforeT = beforePolicies.filter((p) => p.tablename === t);
      const afterT = afterPolicies.filter((p) => p.tablename === t);
      const roles = [...new Set(beforeT.flatMap((p) => p.roles))];
      for (const role of roles) {
        for (const cmd of COMMANDS) {
          const applies = (p) => p.roles.includes(role) && covers(p, cmd);
          const bApp = beforeT.filter(applies);
          const expUsing = usesUsing(cmd) ? sortUniqOr(bApp.map((p) => p.qual).filter((x) => x !== null)) : null;
          const expCheck = usesCheck(cmd) ? sortUniqOr(bApp.map(checkOf).filter((x) => x !== null)) : null;

          const aApp = afterT.filter((p) => p.roles.includes(role) && covers(p, cmd));
          // No overlap must remain in the 'after' schema.
          assert.ok(aApp.length <= 1, `${t}/${role}/${cmd}: ${aApp.length} permissive policies after (expected ≤1)`);

          const present = expUsing !== null || expCheck !== null;
          if (!present) {
            assert.equal(aApp.length, 0, `${t}/${role}/${cmd}: access existed after but not before`);
            continue;
          }
          assert.equal(aApp.length, 1, `${t}/${role}/${cmd}: before granted access, after has ${aApp.length} policies`);
          const expected = canon(t, cmd, role, expUsing, expCheck);
          const actual = { qual: aApp[0].qual ?? "", check: aApp[0].with_check ?? "" };
          if (expected.qual !== actual.qual || expected.check !== actual.check) {
            mismatches.push(`${t}/${role}/${cmd}\n  expected USING: ${expected.qual}\n  actual   USING: ${actual.qual}\n  expected CHECK: ${expected.check}\n  actual   CHECK: ${actual.check}`);
          }
        }
      }
    }
    assert.deepEqual(mismatches, [], `predicate mismatches:\n${mismatches.join("\n")}`);
  });
});

describe("the 'after' schema is advisor-clean and keeps set-form helpers", () => {
  test("no {table, role, command} has more than one permissive policy (public + wh)", () => {
    const n = psql(
      `with app as (
         select schemaname, tablename, policyname, unnest(roles) as role, a.action
         from pg_policies p
         cross join lateral (select unnest(case when p.cmd='ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[p.cmd] end) as action) a
         where p.permissive='PERMISSIVE' and p.schemaname in ('public','wh'))
       select count(*) from (
         select 1 from app where role in ('authenticated','anon') group by schemaname, tablename, role, action having count(*) > 1
       ) z`,
      aft,
    );
    assert.equal(n, "0", "multiple_permissive_policies groups remain");
  });

  test("no consolidated policy reintroduces a per-row helper or bare auth.uid()", () => {
    const left = psql(
      `select count(*) from pg_policies where schemaname='public' and tablename in (${manifestTables.map((t) => `'${t}'`).join(",")})
       and coalesce(qual,'')||coalesce(with_check,'') ~ 'wh\\.(is_member|is_household_admin|member_id|may_see_child|may_change_child|may_see_health|may_see_event|is_event_participant|is_child_of|has_role|may_see_finance)\\('`,
      aft,
    );
    assert.equal(left, "0");
  });
});

describe("usda_foods: dropping the deny-all preserves access (false OR x ≡ x)", () => {
  test("authenticated keeps the linked-row SELECT; anon and writes stay denied", () => {
    const pol = afterPolicies.filter((p) => p.tablename === "usda_foods");
    // Exactly one permissive policy remains: SELECT, to authenticated, the linked read.
    assert.equal(pol.length, 1, "usda_foods should keep one permissive policy");
    assert.equal(pol[0].cmd, "SELECT");
    assert.deepEqual(pol[0].roles, ["authenticated"]);
    assert.match(pol[0].qual, /grocery_catalog/);
    // No anon policy and no write policy → anon and all writes denied by absence.
    assert.ok(!pol.some((p) => p.roles.includes("anon")));
    assert.ok(!pol.some((p) => ["INSERT", "UPDATE", "DELETE", "ALL"].includes(p.cmd)));
  });
});

describe("concrete before/after probe on representative tables", () => {
  const HEAD = "a1111111-1111-4111-8111-111111111111";
  const ADULT = "a2222222-2222-4222-8222-222222222222";
  const OUT = "a3333333-3333-4333-8333-333333333333";
  const B1 = "b0000001-0000-4000-8000-000000000001";
  const B2 = "b0000002-0000-4000-8000-000000000002";
  const CO = "c0000001-0000-4000-8000-000000000001";
  const CN = "c0000002-0000-4000-8000-000000000001";

  function seed(options) {
    psql(
      `insert into auth.users (id, email) values ('${HEAD}','head@example.test'),('${ADULT}','adult@example.test'),('${OUT}','out@example.test');`,
      options,
    );
    const [hh] = asProfile(HEAD, `select household_id || ' ' || member_id from wh.create_household('Probe Home','Head');`, options).split(" ");
    psql(`insert into public.profiles (id, display_name) values ('${ADULT}','Adult');`, options);
    const adultMember = psql(
      `insert into public.household_members (household_id, profile_id, member_type, display_name) values ('${hh}','${ADULT}','adult','Adult') returning id;`,
      options,
    );
    psql(`insert into public.household_roles (household_id, member_id, role) values ('${hh}','${adultMember}','adult');`, options);
    asProfile(OUT, `select wh.create_household('Other Home','Out');`, options);
    // Identical rows in both databases, inserted privileged (RLS bypassed).
    psql(`insert into public.budgets (id, household_id, category, limit_minor) values ('${B1}','${hh}','groceries',50000),('${B2}','${hh}','utilities',30000);`, options);
    psql(`insert into public.consumables (id, household_id, name) values ('${CO}','${hh}','Dish soap');`, options);
    psql(`insert into public.connections (id, household_id, name, connector_type) values ('${CN}','${hh}','Bank','plaid');`, options);
    return { hh, adultMember };
  }

  let ctx;
  before(() => {
    ctx = { before: seed(bef), after: seed(aft) };
  });

  const visibleIds = (who, sql, options) => {
    let rows = "";
    try {
      rows = who === "anon" ? asAnonymous(sql, options) : asProfile(who, sql, options);
    } catch {
      rows = ""; // a table-grant denial (e.g. anon) is no visible rows
    }
    return rows.split("\n").filter(Boolean).sort().join(",");
  };

  const table = { budgets: "select id from public.budgets order by id", consumables: "select id from public.consumables order by id", connections: "select id from public.connections order by id" };

  for (const [name, sql] of Object.entries(table)) {
    test(`${name}: visible row-id set is identical before and after, for every role`, () => {
      for (const who of [HEAD, ADULT, OUT, "anon"]) {
        const b = visibleIds(who, sql, bef);
        const a = visibleIds(who, sql, aft);
        assert.equal(a, b, `${name} visibility changed for ${who}: before=[${b}] after=[${a}]`);
      }
    });
  }

  test("write allow/deny is identical before and after (budgets / connections)", () => {
    // mut(hh) builds the mutation for a given database's own household id, so
    // the same logical probe runs against both databases' real rows.
    const probes = [
      ["insert-budget-adult", ADULT, (hh) => `insert into public.budgets (household_id, category, limit_minor) values ('${hh}','probe',1);`],
      ["insert-budget-outsider", OUT, (hh) => `insert into public.budgets (household_id, category, limit_minor) values ('${hh}','intruder',1);`],
      ["update-connection-adult", ADULT, () => `update public.connections set name='edited-adult' where id='${CN}';`],
      ["update-connection-outsider", OUT, () => `update public.connections set name='intruder' where id='${CN}';`],
      ["delete-connection-adult", ADULT, () => `delete from public.connections where id='${CN}';`],
      ["delete-budget-outsider", OUT, () => `delete from public.budgets where id='${B1}';`],
    ];
    for (const [label, who, mut] of probes) {
      const outcome = (src) => {
        const copy = `${src}_p`;
        psql(`drop database if exists ${copy}; create database ${copy} template ${src};`, { database: "postgres" });
        const o = { database: copy };
        const hh = psql(`select household_id from public.budgets where id='${B1}'`, o);
        try {
          asProfile(who, mut(hh), o);
        } catch {
          // a thrown denial and a silent no-op are both captured by re-reading
        }
        // What actually changed, read privileged so RLS cannot hide it.
        const budgets = psql(`select coalesce(string_agg(category,'|' order by category),'') from public.budgets`, o);
        const conn = psql(`select coalesce(string_agg(name,'|' order by name),'') from public.connections`, o);
        psql(`drop database if exists ${copy}`, { database: "postgres" });
        return { budgets, conn };
      };
      const b = outcome(BEFORE);
      const a = outcome(AFTER);
      assert.deepEqual(a, b, `${label}: write outcome changed. before=${JSON.stringify(b)} after=${JSON.stringify(a)}`);
    }
  });
});
