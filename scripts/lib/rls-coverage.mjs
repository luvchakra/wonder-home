/**
 * RLS coverage: what the database says (facts) and what is wrong with it
 * (evaluate). `scripts/test-coverage-rls.mjs` feeds it a fresh database built
 * from the migrations; the logic lives here so its allowlists and baselines
 * are tested without one.
 *
 * Violations are keyed `<check>:<object>`. A key in `allow` is reviewed and
 * permanent; a key in `baseline` is a known gap that a plan story will burn
 * down. Anything else is NEW and fails. A baseline key that no longer
 * violates is STALE and fails too, so the baseline only ever shrinks.
 */
import { psql } from "./db.mjs";

/** Schemas the platform owns; their tables are not ours to police. */
export const PLATFORM_SCHEMAS = ["auth", "storage", "extensions", "graphql", "graphql_public", "realtime", "vault", "pgsodium", "net", "cron", "supabase_functions", "supabase_migrations", "pg_catalog", "information_schema", "pg_toast"];

/** Pattern for a per-row membership helper that policies must not call. */
export const BANNED_HELPERS = /wh\.(is_member|is_household_admin|member_id|may_see_child|may_change_child|may_see_health|may_see_event|is_event_participant|is_child_of|has_role|may_see_finance)\(/;

/** `auth.uid()` is fine only as `(select auth.uid())`, optionally aliased. */
const WRAPPED_UID = /\(\s*select\s+auth\.uid\(\)(\s+as\s+\w+)?\s*\)/gi;
export const hasBareUid = (sql) => /auth\.uid\(\)/i.test(sql.replace(WRAPPED_UID, ""));

const list = (xs) => `array[${xs.map((x) => `'${x}'`).join(",")}]::text[]`;

/** One round trip: every fact the checks need, as JSON. */
export function gatherFacts(options) {
  const platform = list(PLATFORM_SCHEMAS);
  const sql = `
with
tables as (
  select n.nspname as schema, c.relname as name, c.oid, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname <> all(${platform}) and n.nspname not like 'pg\\_%'
),
funcs as (
  select n.nspname as schema, p.proname as name, p.oid, p.prosecdef as secdef,
         exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%') as has_search_path
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname <> all(${platform}) and n.nspname not like 'pg\\_%'
)
select json_build_object(
  'tables', (select coalesce(json_agg(json_build_object(
      'name', schema || '.' || name, 'rls', rls,
      'policies', (select count(*) from pg_policy p where p.polrelid = t.oid),
      'anonPrivileges', (select coalesce(json_agg(priv), '[]') from unnest(array['select','insert','update','delete']) priv where has_table_privilege('anon', t.oid, priv))
    ) order by schema, name), '[]') from tables t),
  'policies', (select coalesce(json_agg(json_build_object(
      'name', schemaname || '.' || tablename || '.' || policyname, 'roles', roles, 'cmd', cmd,
      'qual', qual, 'withCheck', with_check
    ) order by schemaname, tablename, policyname), '[]') from pg_policies where schemaname <> all(${platform})),
  'functions', (select coalesce(json_agg(json_build_object(
      'name', schema || '.' || name, 'hasSearchPath', has_search_path,
      'anonExecute', has_function_privilege('anon', oid, 'execute'),
      'anonReachable', has_function_privilege('anon', oid, 'execute') and has_schema_privilege('anon', schema, 'usage')
    ) order by schema, name), '[]') from funcs where secdef)
);`;
  return JSON.parse(psql(sql, options));
}

const isFalse = (q) => /^\(?\s*false\s*\)?$/i.test((q ?? "").trim());
const isTrue = (q) => /^\(?\s*true\s*\)?$/i.test((q ?? "").trim());

/** Every violation the facts show, keyed `<check>:<object>`. */
export function findViolations(facts) {
  const out = new Map();
  const add = (key, why) => out.set(key, why);
  for (const t of facts.tables) {
    if (!t.rls) add(`no-rls:${t.name}`, `${t.name} has row-level security disabled`);
    else if (t.policies === 0) add(`no-policy:${t.name}`, `${t.name} has RLS enabled and no policy (add a deny-all *_no_client_access policy if service-role only)`);
    if (t.anonPrivileges.length) add(`anon-table-grant:${t.name}`, `anon holds ${t.anonPrivileges.join("/")} on ${t.name}`);
  }
  for (const p of facts.policies) {
    const text = `${p.qual ?? ""} ${p.withCheck ?? ""}`;
    if (BANNED_HELPERS.test(text)) add(`row-helper:${p.name}`, `${p.name} calls a per-row membership helper`);
    if (hasBareUid(text)) add(`bare-uid:${p.name}`, `${p.name} uses bare auth.uid(); write (select auth.uid())`);
    const open = isTrue(p.qual) || isTrue(p.withCheck);
    const toAnon = p.roles.some((r) => r === "anon" || r === "public");
    if (open) add(`open-policy:${p.name}`, `${p.name} grants everyone in ${p.roles.join(",")} (using true)`);
    if (toAnon && !(isFalse(p.qual) && (p.withCheck == null || isFalse(p.withCheck)))) add(`anon-policy:${p.name}`, `${p.name} applies to anon/public and is not a deny-all`);
  }
  for (const f of facts.functions) {
    if (!f.hasSearchPath) add(`secdef-search-path:${f.name}`, `${f.name} is SECURITY DEFINER without a pinned search_path`);
    if (f.anonReachable) add(`anon-reachable-secdef:${f.name}`, `anon can call SECURITY DEFINER ${f.name}`);
    else if (f.anonExecute) add(`anon-execute-secdef:${f.name}`, `anon holds EXECUTE on SECURITY DEFINER ${f.name} (its schema is not usable by anon, so unreachable today)`);
  }
  return out;
}

/** Splits violations into new ones and stale baseline entries. */
export function judge(violations, { allow = {}, baseline = {} }) {
  const fresh = [];
  for (const [key, why] of violations) if (!(key in allow) && !(key in baseline)) fresh.push(`${why} [${key}]`);
  const stale = Object.keys(baseline).filter((k) => !violations.has(k));
  const staleAllow = Object.keys(allow).filter((k) => !violations.has(k));
  const unexplained = [...Object.entries(allow), ...Object.entries(baseline)].filter(([, v]) => !String(v).trim()).map(([k]) => k);
  return { fresh, stale, staleAllow, unexplained };
}
