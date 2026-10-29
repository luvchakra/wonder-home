-- Platform admin "Performance" section: one aggregate-only snapshot of the
-- database's own statistics, for platform staff.
--
-- Safe in either order: this only adds a function. Nothing reads it until the
-- page ships, and the page shows "not measured" if it is missing.
--
-- Access: `service_role` only, reached through adminGrant.platformAdmin. The
-- caller passes the staff profile id the app already verified, and the
-- function checks it again against platform_admins, so a service-role call
-- with any other id gets an error and no data. anon and authenticated cannot
-- execute it (so it adds no authenticated-SECURITY-DEFINER advisor finding).
--
-- Aggregate only: relation names and counts, plus query shapes with every
-- literal and number replaced and cut to 200 characters. No row contents, no
-- household, member or email data, no parameters.

create or replace function public.platform_performance_snapshot(p_staff_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ext_schema text;
  v_statements jsonb := null;
  v_result jsonb;
begin
  if p_staff_profile_id is null or not exists (
    select 1 from public.platform_admins a
    where a.profile_id = p_staff_profile_id and a.status = 'active'
  ) then
    raise exception 'platform staff only' using errcode = '42501';
  end if;

  select n.nspname into v_ext_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_stat_statements';

  if v_ext_schema is not null then
    execute format($q$
      with s as (
        select
          left(btrim(regexp_replace(regexp_replace(regexp_replace(query, '''[^'']*''', '?', 'g'), '\m\d+(\.\d+)?\M', '?', 'g'), '\s+', ' ', 'g')), 200) as shape,
          calls, total_exec_time, mean_exec_time
        from %1$I.pg_stat_statements
        where dbid = (select oid from pg_database where datname = current_database())
          and query not ilike '%%pg_stat_statements%%'
      ), g as (
        select shape, sum(calls)::bigint as calls, sum(total_exec_time) as total_ms,
               sum(total_exec_time) / nullif(sum(calls), 0) as mean_ms
        from s group by shape
      )
      select jsonb_build_object(
        'byTotal', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select shape, calls, round(total_ms::numeric, 0) as total_ms, round(mean_ms::numeric, 2) as mean_ms
          from g order by total_ms desc limit 10) t), '[]'::jsonb),
        'byMean', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select shape, calls, round(total_ms::numeric, 0) as total_ms, round(mean_ms::numeric, 2) as mean_ms
          from g where calls >= 5 order by mean_ms desc limit 10) t), '[]'::jsonb))
    $q$, v_ext_schema) into v_statements;
  end if;

  select jsonb_build_object(
    'statements', v_statements,
    'cache', (
      select jsonb_build_object(
        'tableHit', (select sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) from pg_statio_user_tables),
        'indexHit', (select sum(idx_blks_hit)::numeric / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0) from pg_statio_user_indexes))),
    'largestTables', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select c.relname as name, pg_total_relation_size(c.oid) as bytes, c.reltuples::bigint as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc limit 10) t), '[]'::jsonb),
    'largestIndexes', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select i.indexrelname as name, i.relname as "table", pg_relation_size(i.indexrelid) as bytes, i.idx_scan as scans
      from pg_stat_user_indexes i where i.schemaname = 'public'
      order by pg_relation_size(i.indexrelid) desc limit 10) t), '[]'::jsonb),
    'seqScanHeavy', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select relname as name, seq_scan, coalesce(idx_scan, 0) as idx_scan, n_live_tup as rows, seq_tup_read
      from pg_stat_user_tables
      where schemaname = 'public' and seq_scan > 0 and seq_scan > coalesce(idx_scan, 0)
      order by seq_tup_read desc limit 10) t), '[]'::jsonb),
    'unusedIndexes', (
      select jsonb_build_object('count', count(*), 'bytes', coalesce(sum(pg_relation_size(i.indexrelid)), 0))
      from pg_stat_user_indexes i join pg_index x on x.indexrelid = i.indexrelid
      where i.schemaname = 'public' and i.idx_scan = 0 and not x.indisunique and not x.indisprimary),
    'deadTuples', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select relname as name, n_live_tup as live, n_dead_tup as dead,
             round(n_dead_tup::numeric * 100 / nullif(n_live_tup + n_dead_tup, 0), 1) as dead_pct
      from pg_stat_user_tables
      where schemaname = 'public' and n_dead_tup > 0
      order by n_dead_tup desc limit 10) t), '[]'::jsonb),
    'connections', jsonb_build_object(
      'max', current_setting('max_connections')::int,
      'reserved', current_setting('superuser_reserved_connections')::int,
      'total', (select count(*) from pg_stat_activity where backend_type = 'client backend'),
      'active', (select count(*) from pg_stat_activity where backend_type = 'client backend' and state = 'active'),
      'idle', (select count(*) from pg_stat_activity where backend_type = 'client backend' and state = 'idle'),
      'idleInTransaction', (select count(*) from pg_stat_activity where backend_type = 'client backend' and state like 'idle in transaction%')),
    'takenAt', now()
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_performance_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.platform_performance_snapshot(uuid) to service_role;

comment on function public.platform_performance_snapshot(uuid) is
  'Aggregate database statistics for the platform-admin Performance page. service_role only; re-checks that the given profile is active platform staff.';
