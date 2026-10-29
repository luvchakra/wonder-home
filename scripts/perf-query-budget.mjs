#!/usr/bin/env node
/**
 * PERF-15: database cost of the hot read shapes, as a standing gate.
 *
 *   node scripts/perf-query-budget.mjs            check against perf/query-budget.json
 *   node scripts/perf-query-budget.mjs --update   re-measure and rewrite the budget
 *
 * Seeds a fixture (21 households, ~30k events, ~6k meals), then runs each read
 * of perf/queries.mjs as an authenticated member with real JWT claims, under
 * `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Wall-clock on a CI runner is
 * noise, so the gate is on what the plan does: shared buffers touched and
 * rows read are deterministic for a fixed fixture, and a relation that must
 * be reached by index must not be sequentially scanned. Execution time has
 * one very loose ceiling. docs/performance-budgets.md says how to add a query.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { QUERIES } from "../perf/queries.mjs";
import { asProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_perf_budget";
const options = { database: DB };
const BUDGET_PATH = new URL("../perf/query-budget.json", import.meta.url);
const HEADROOM = 1.5; // buffers and rows: measured x1.5
const MS_CEILING = 2000; // reads must stay under 500 ms in production; a CI runner gets 4x

const USERS = 21;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The fixture: USERS households, the first one measured. Fixed, so counts repeat. */
function seed() {
  buildTestDatabase(DB);
  psql(
    `insert into auth.users (id, email)
       select ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'perf' || g || '@example.test' from generate_series(1, ${USERS}) g;`,
    options,
  );
  psql(
    `do $$
     declare g int; begin
       for g in 1..${USERS} loop
         perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-' || lpad(g::text, 12, '0'), 'role', 'authenticated')::text, true);
         perform wh.create_household('Perf Home ' || g, 'Perf ' || g);
       end loop;
     end $$;`,
    options,
  );
  psql(
    `insert into public.family_events (household_id, title, kind, starts_at, ends_at)
       select h.id, 'Event ' || g, 'family_time',
              date_trunc('day', now()) + ((g - 750) || ' hours')::interval,
              date_trunc('day', now()) + ((g - 750) || ' hours')::interval + interval '1 hour'
       from public.households h, generate_series(1, 1500) g;
     insert into public.event_participants (household_id, event_id, member_id)
       select e.household_id, e.id, m.id
       from public.family_events e
       join public.household_members m on m.household_id = e.household_id;
     insert into public.meals (household_id, name, slot, on_date, ready_by)
       select h.id, 'Meal ' || g, (array['breakfast','lunch','dinner'])[1 + g % 3],
              current_date + (g / 3 - 50), date_trunc('day', now()) + ((g * 8 - 400) || ' hours')::interval
       from public.households h, generate_series(1, 300) g;
     insert into public.meal_ingredient_needs (household_id, meal_id, name, quantity)
       select m.household_id, m.id, 'Item ' || n, 1 from public.meals m, generate_series(1, 3) n;
     insert into public.gift_plans (household_id, recipient, needed_by)
       select h.id, 'Person ' || g, current_date + g from public.households h, generate_series(1, 40) g;
     analyze;`,
    options,
  );
  const household = psql(`select id from public.households where name = 'Perf Home 1'`, options);
  return { household, profile: uid(1) };
}

/** Every plan node, flattened. */
function* nodes(plan) {
  yield plan;
  for (const child of plan.Plans ?? []) yield* nodes(child);
}

function measure(sql, profile) {
  const out = asProfile(profile, `explain (analyze, buffers, format json) ${sql}`, options);
  const root = JSON.parse(out)[0];
  const all = [...nodes(root.Plan)];
  const buffers = (root.Plan["Shared Hit Blocks"] ?? 0) + (root.Plan["Shared Read Blocks"] ?? 0);
  const rowsRead = all.filter((n) => /Scan/.test(n["Node Type"])).reduce((sum, n) => sum + (n["Actual Rows"] + (n["Rows Removed by Filter"] ?? 0)) * (n["Actual Loops"] ?? 1), 0);
  const seqScans = [...new Set(all.filter((n) => n["Node Type"] === "Seq Scan").map((n) => n["Relation Name"]))].sort();
  return { buffers, rowsRead, seqScans, ms: root["Execution Time"] };
}

const { household, profile } = seed();
const budget = process.argv.includes("--update") ? null : JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
const next = { _note: "Measured on the PERF-15 fixture x1.5. Raise a number only in a PR that says why; `npm run budget:queries -- --update` rewrites it.", queries: {} };
const failures = [];
const rows = [];

for (const q of QUERIES) {
  const sql = q.sql.replaceAll(":household", `'${household}'`);
  const m = measure(sql, profile);
  const cap = budget?.queries[q.id];
  rows.push({ query: q.id, buffers: m.buffers, rowsRead: m.rowsRead, seqScans: m.seqScans.join(",") || "-", ms: Math.round(m.ms * 10) / 10 });
  next.queries[q.id] = { maxBuffers: Math.ceil(m.buffers * HEADROOM), maxRowsRead: Math.ceil(m.rowsRead * HEADROOM), noSeqScan: q.indexed, maxMs: MS_CEILING };
  if (!budget) continue;
  if (!cap) failures.push(`${q.id}: no budget (run with --update and commit perf/query-budget.json)`);
  else {
    if (m.buffers > cap.maxBuffers) failures.push(`${q.id}: ${m.buffers} buffers > ${cap.maxBuffers}`);
    if (m.rowsRead > cap.maxRowsRead) failures.push(`${q.id}: ${m.rowsRead} rows read > ${cap.maxRowsRead}`);
    for (const rel of cap.noSeqScan) if (m.seqScans.includes(rel)) failures.push(`${q.id}: sequential scan on ${rel}, which must use an index`);
    if (m.ms > cap.maxMs) failures.push(`${q.id}: ${m.ms.toFixed(0)} ms > ${cap.maxMs} ms ceiling`);
  }
}
for (const id of Object.keys(budget?.queries ?? {})) if (!QUERIES.some((q) => q.id === id)) failures.push(`${id}: budgeted but no longer in perf/queries.mjs`);

console.table(rows);
if (!budget) {
  writeFileSync(BUDGET_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log("Wrote perf/query-budget.json");
} else if (failures.length) {
  console.error("Query budget exceeded:");
  for (const f of failures) console.error(`  ${f}`);
  console.error("Fix the query or index. Raise a budget only deliberately: see docs/performance-budgets.md.");
  process.exit(1);
} else console.log(`All ${QUERIES.length} hot reads are within budget.`);
