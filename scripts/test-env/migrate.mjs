#!/usr/bin/env node
/**
 * Applies every migration in supabase/migrations, in order, to the test
 * project `wonderhome-test`, then points its schedules at the test server.
 *
 *   node scripts/test-env/migrate.mjs             apply what is missing, then retarget
 *   node scripts/test-env/migrate.mjs --dry-run   list what would be applied
 *   node scripts/test-env/migrate.mjs --retarget  only retarget the schedules
 *
 * Needs TEST_DATABASE_URL (the test project's own connection string) and
 * psql; normally run by .github/workflows/test-env.yml. Refuses the
 * production project. A migration is applied
 * to test first, then production (CLAUDE.md, "Applying a migration").
 *
 * History is kept where the Supabase CLI and the MCP keep it,
 * supabase_migrations.schema_migrations, matched by base name like
 * scripts/check-migrations-applied.mjs. Re-running applies only what is missing.
 *
 * Extensions, Vault, pg_cron and pg_net: the hosted project offers all four,
 * and the migrations create what they use themselves (each guards on
 * pg_available_extensions), so nothing is set up by hand first.
 *
 * Retargeting (docs/test-environment.md): the migrations schedule pg_cron jobs
 * that call https://home.wonderapps.biz. On test each is rewritten to call
 * https://test.home.wonderapps.biz, anything more frequent than hourly runs
 * hourly, and the GitHub delivery clock is removed (GitHub's delivery-clock
 * and background-jobs workflows serve production only; the test server's
 * stale heartbeat makes it deliver for itself, docs/background-jobs.md).
 */
import { readdirSync, readFileSync } from "node:fs";

import { baseName } from "../check-migrations-applied.mjs";
import { PRODUCTION_HOST, TEST_HOST, exec, literal, requireDatabaseUrl, rows } from "./lib.mjs";

const DIR = new URL("../../supabase/migrations/", import.meta.url);

const HISTORY = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
`;

/** pg_cron jobs the test project must not run at all. */
export const TEST_UNSCHEDULED_JOBS = ["wonderhome-delivery-clock-github"];

/**
 * SQL that points every pg_cron job at the test server, at most hourly.
 * Idempotent: a job already retargeted is rewritten to the same thing.
 */
export function retargetSql() {
  const drop = TEST_UNSCHEDULED_JOBS.map((name) => `perform cron.unschedule(${literal(name)}) where exists (select 1 from cron.job where jobname = ${literal(name)});`).join("\n    ");
  return `
do $retarget$
declare
  j record;
  minute int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed: nothing to retarget';
    return;
  end if;
  ${drop}
  for j in select jobid, jobname, schedule, command from cron.job loop
    minute := abs(hashtext(coalesce(j.jobname, j.jobid::text))) % 60;
    perform cron.alter_job(
      j.jobid,
      -- Every-hour-or-more-often (hour field "*") becomes once an hour; daily and rarer jobs keep their time.
      schedule := case when split_part(j.schedule, ' ', 2) = '*'
        then minute || ' * ' || array_to_string((string_to_array(j.schedule, ' '))[3:5], ' ')
        else j.schedule end,
      command := replace(j.command, ${literal(PRODUCTION_HOST)}, ${literal(TEST_HOST)})
    );
  end loop;
end
$retarget$;
`;
}

/** Every pg_cron job and whether it still calls production (only where pg_cron is installed). */
export const JOBS_SQL = `select jobname, schedule, (command like ${literal(`%${PRODUCTION_HOST}/%`)}) as still_production from cron.job order by jobname`;

export function migrationFiles() {
  return readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
}

/** Files whose base name the history lacks, in order. */
export function pending(files, appliedNames) {
  const known = new Set(appliedNames.map(baseName));
  return files.filter((f) => !known.has(baseName(f)));
}

async function main() {
  const args = process.argv.slice(2);
  const url = requireDatabaseUrl();

  if (!args.includes("--retarget")) {
    if (!args.includes("--dry-run")) exec(url, HISTORY);
    const applied = args.includes("--dry-run")
      ? (() => { try { return rows(url, "select name from supabase_migrations.schema_migrations"); } catch { return []; } })()
      : rows(url, "select name from supabase_migrations.schema_migrations");
    const todo = pending(migrationFiles(), applied.map((r) => r.name).filter(Boolean));
    console.log(`${todo.length} of ${migrationFiles().length} migration(s) to apply to the test database.`);
    if (args.includes("--dry-run")) {
      for (const f of todo) console.log(`  ${f}`);
      return;
    }
    for (const file of todo) {
      const sql = readFileSync(new URL(file, DIR), "utf8");
      const version = file.slice(0, 14);
      const name = file.replace(/\.sql$/, "").slice(15);
      // The file and its history row in one transaction: a failure leaves neither.
      try {
        exec(url, `begin;\n${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values (${literal(version)}, ${literal(name)}) on conflict (version) do nothing;\ncommit;\n`);
      } catch (error) {
        console.error(`FAILED at ${file}: ${error.message}`);
        console.error("Fix the cause and re-run; everything before it is applied and recorded.");
        process.exit(1);
      }
      console.log(`applied ${file}`);
    }
  }

  exec(url, retargetSql());
  const hasCron = rows(url, "select to_regclass('cron.job') is not null as present")[0]?.present === true;
  const jobs = hasCron ? rows(url, JOBS_SQL) : [];
  const bad = jobs.filter((j) => j.still_production);
  console.log(`Schedules on test: ${jobs.map((j) => `${j.jobname} (${j.schedule})`).join(", ") || "none"}.`);
  if (bad.length > 0) {
    console.error(`Still calling production: ${bad.map((j) => j.jobname).join(", ")}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
