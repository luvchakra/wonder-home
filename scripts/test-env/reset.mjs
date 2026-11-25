#!/usr/bin/env node
/**
 * Empties the test project back to nothing, so migrate.mjs can rebuild it
 * from the migrations (docs/test-environment.md).
 *
 *   node scripts/test-env/reset.mjs --yes-reset-test
 *
 * Drops the app's schemas (wh, and everything in public), every account,
 * every pg_cron job, the WonderHome Vault secrets, every Storage object and
 * the migration history. Refuses the production project, and does nothing
 * without the flag. Then run migrate.mjs and seed.mjs.
 */
import { exec, requireDatabaseUrl } from "./lib.mjs";

export const RESET_SQL = `
do $reset$
declare j record;
begin
  if to_regclass('cron.job') is not null then
    for j in select jobid from cron.job loop perform cron.unschedule(j.jobid); end loop;
  end if;
  if to_regclass('storage.objects') is not null then delete from storage.objects; end if;
  if to_regclass('storage.buckets') is not null then delete from storage.buckets; end if;
  if to_regclass('auth.users') is not null then delete from auth.users; end if;
  if to_regclass('vault.secrets') is not null then
    delete from vault.secrets where name like 'wonderhome%' or name in ('cron_secret', 'github_dispatch_token');
  end if;
end
$reset$;
drop schema if exists wh cascade;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
drop schema if exists supabase_migrations cascade;
`;

async function main() {
  if (!process.argv.includes("--yes-reset-test")) {
    console.error("This empties the wonderhome-test database. Re-run with --yes-reset-test.");
    process.exit(2);
  }
  exec(requireDatabaseUrl(), RESET_SQL);
  console.log(`Reset the test database. Next: node scripts/test-env/migrate.mjs && node scripts/test-env/seed.mjs`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
