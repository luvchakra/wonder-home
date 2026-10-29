-- Platform admin "Performance" actions: the first write surface on the staff
-- page. A fixed allowlist of maintenance actions, each its own SECURITY
-- DEFINER function. No function here runs caller-supplied SQL.
--
-- Safe in either order: this only adds functions and one index, and redefines
-- platform_performance_snapshot with two extra keys (unusedIndexList,
-- duplicateIndexes). The page reads missing keys as empty, so old page + new
-- database and new page + old database both work.
--
-- Access, for every function below: `service_role` only (reached through
-- adminGrant.platformAdmin), execute revoked from public/anon/authenticated.
-- Each re-checks that the profile is active platform staff and has the role
-- the action needs; the app checks again before calling.
--   analyze            operator, owner
--   reset statistics   owner
--   end idle sessions  owner
--   last runs (read)   any active staff
--
-- Audit: every run writes an `audit_events` row (household_id null, event
-- `platform.perf_action`; actor, action, target, outcome, duration in
-- metadata), which the platform audit trail already lists.
-- Rate limit: one real run per action + target per minute; a previewed
-- (dry-run) end-sessions count is read-only and unlimited.

-- ---------------------------------------------------------------------------
-- Guard shared by the actions (not callable by anyone but the functions)
-- ---------------------------------------------------------------------------
create or replace function public.platform_perf_guard(
  p_staff_profile_id uuid, p_action text, p_target text, p_owner_only boolean, p_rate_limited boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select a.role into v_role
  from public.platform_admins a
  where a.profile_id = p_staff_profile_id and a.status = 'active';

  if p_staff_profile_id is null or v_role is null then
    raise exception 'platform staff only' using errcode = '42501';
  end if;
  if v_role = 'support' or (p_owner_only and v_role <> 'owner') then
    raise exception 'your platform role cannot run this action' using errcode = '42501';
  end if;

  if p_rate_limited then
    -- Serialise concurrent runs of the same action + target, then look back a minute.
    perform pg_advisory_xact_lock(hashtextextended('platform.perf_action:' || p_action || ':' || coalesce(p_target, ''), 0));
    if exists (
      select 1 from public.audit_events e
      where e.household_id is null
        and e.event_type = 'platform.perf_action'
        and e.metadata ->> 'action' = p_action
        and coalesce(e.metadata ->> 'target', '') = coalesce(p_target, '')
        and e.created_at > now() - interval '1 minute'
    ) then
      raise exception 'rate_limited: this action ran for this target less than a minute ago' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit writer (internal)
-- ---------------------------------------------------------------------------
create or replace function public.platform_perf_audit(
  p_staff_profile_id uuid, p_action text, p_target text, p_outcome text, p_started timestamptz, p_detail jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (household_id, actor_profile_id, event_type, metadata)
  values (
    null, p_staff_profile_id, 'platform.perf_action',
    jsonb_build_object(
      'action', p_action,
      'target', p_target,
      'outcome', p_outcome,
      'durationMs', round(extract(epoch from (clock_timestamp() - p_started)) * 1000),
      'detail', coalesce(p_detail, '{}'::jsonb)
    )
  );
$$;

-- Hot path for the "last run" lookups and the rate-limit check.
create index if not exists audit_events_platform_perf_idx
  on public.audit_events (created_at desc)
  where household_id is null and event_type = 'platform.perf_action';

-- ---------------------------------------------------------------------------
-- 1. Refresh planner statistics (ANALYZE) on one public table, or all of them
-- ---------------------------------------------------------------------------
create or replace function public.platform_perf_analyze(p_staff_profile_id uuid, p_table text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '60s'
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_rel record;
  v_done int := 0;
  v_target text := coalesce(p_table, '*');
begin
  perform public.platform_perf_guard(p_staff_profile_id, 'analyze', v_target, false, true);

  begin
    if p_table is null or p_table = '*' then
      -- Whole schema, within a 20-second budget; the rest waits for the next run.
      for v_rel in
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname
      loop
        exit when clock_timestamp() - v_started > interval '20 seconds';
        execute format('analyze %I.%I', 'public', v_rel.relname);
        v_done := v_done + 1;
      end loop;
    else
      -- The name must be an existing ordinary table in `public`; it is only ever used through %I.
      select c.relname into v_rel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = p_table;
      if v_rel.relname is null then
        raise exception 'unknown table' using errcode = '22023';
      end if;
      execute format('analyze %I.%I', 'public', v_rel.relname);
      v_done := 1;
    end if;
  exception when others then
    perform public.platform_perf_audit(p_staff_profile_id, 'analyze', v_target, 'failed', v_started, jsonb_build_object('reason', sqlstate));
    return jsonb_build_object('ok', false, 'reason', case sqlstate when '55P03' then 'busy' when '22023' then 'unknown_table' when '57014' then 'timeout' else 'error' end);
  end;

  perform public.platform_perf_audit(p_staff_profile_id, 'analyze', v_target, 'ok', v_started, jsonb_build_object('tables', v_done));
  return jsonb_build_object('ok', true, 'tables', v_done);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Reset query statistics (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.platform_perf_reset_statements(p_staff_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '15s'
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_schema text;
begin
  perform public.platform_perf_guard(p_staff_profile_id, 'reset_statements', null, true, true);

  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_stat_statements';

  if v_schema is null then
    perform public.platform_perf_audit(p_staff_profile_id, 'reset_statements', null, 'failed', v_started, jsonb_build_object('reason', 'extension_off'));
    return jsonb_build_object('ok', false, 'reason', 'extension_off');
  end if;

  begin
    execute format('select %I.pg_stat_statements_reset()', v_schema);
  exception when others then
    perform public.platform_perf_audit(p_staff_profile_id, 'reset_statements', null, 'failed', v_started, jsonb_build_object('reason', sqlstate));
    return jsonb_build_object('ok', false, 'reason', 'error');
  end;

  perform public.platform_perf_audit(p_staff_profile_id, 'reset_statements', null, 'ok', v_started, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. End stuck connections (owner only): only the app's own PostgREST
--    sessions that sit idle inside a transaction. Preview first (dry run).
-- ---------------------------------------------------------------------------
create or replace function public.platform_perf_end_idle_sessions(p_staff_profile_id uuid, p_minutes int, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '15s'
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_pids int[];
  v_ended int := 0;
  v_pid int;
begin
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'minutes must be between 1 and 1440' using errcode = '22023';
  end if;
  perform public.platform_perf_guard(p_staff_profile_id, 'end_idle_sessions', null, true, not coalesce(p_dry_run, true));

  -- Allowlist, not a blocklist: only the PostgREST login role. Never the
  -- caller's own backend, and not postgres, supabase_admin, supabase_*_admin,
  -- pgbouncer, replication, realtime, auth or storage sessions.
  select coalesce(array_agg(a.pid), '{}') into v_pids
  from pg_stat_activity a
  where a.datname = current_database()
    and a.backend_type = 'client backend'
    and a.pid <> pg_backend_pid()
    and a.usename = 'authenticator'
    and a.state like 'idle in transaction%'
    and a.state_change < now() - make_interval(mins => p_minutes);

  if coalesce(p_dry_run, true) then
    return jsonb_build_object('ok', true, 'dryRun', true, 'count', coalesce(array_length(v_pids, 1), 0));
  end if;

  begin
    foreach v_pid in array v_pids loop
      if pg_terminate_backend(v_pid) then v_ended := v_ended + 1; end if;
    end loop;
  exception when others then
    perform public.platform_perf_audit(p_staff_profile_id, 'end_idle_sessions', null, 'failed', v_started, jsonb_build_object('reason', sqlstate, 'minutes', p_minutes));
    return jsonb_build_object('ok', false, 'reason', 'error');
  end;

  perform public.platform_perf_audit(p_staff_profile_id, 'end_idle_sessions', null, 'ok', v_started, jsonb_build_object('ended', v_ended, 'minutes', p_minutes));
  return jsonb_build_object('ok', true, 'dryRun', false, 'count', v_ended);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Last run of each action + target (read only, any active staff)
-- ---------------------------------------------------------------------------
create or replace function public.platform_perf_last_runs(p_staff_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_staff_profile_id is null or not exists (
    select 1 from public.platform_admins a where a.profile_id = p_staff_profile_id and a.status = 'active'
  ) then
    raise exception 'platform staff only' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r)) from (
      select distinct on (e.metadata ->> 'action', e.metadata ->> 'target')
        e.metadata ->> 'action' as action,
        e.metadata ->> 'target' as target,
        e.metadata ->> 'outcome' as outcome,
        e.metadata #>> '{detail,reason}' as reason,
        e.created_at as at
      from (
        select * from public.audit_events
        where household_id is null and event_type = 'platform.perf_action'
        order by created_at desc limit 200
      ) e
      order by e.metadata ->> 'action', e.metadata ->> 'target', e.created_at desc
    ) r), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Access: service_role only
-- ---------------------------------------------------------------------------
revoke all on function public.platform_perf_guard(uuid, text, text, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.platform_perf_audit(uuid, text, text, text, timestamptz, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.platform_perf_analyze(uuid, text) from public, anon, authenticated;
revoke all on function public.platform_perf_reset_statements(uuid) from public, anon, authenticated;
revoke all on function public.platform_perf_end_idle_sessions(uuid, int, boolean) from public, anon, authenticated;
revoke all on function public.platform_perf_last_runs(uuid) from public, anon, authenticated;
grant execute on function public.platform_perf_analyze(uuid, text) to service_role;
grant execute on function public.platform_perf_reset_statements(uuid) to service_role;
grant execute on function public.platform_perf_end_idle_sessions(uuid, int, boolean) to service_role;
grant execute on function public.platform_perf_last_runs(uuid) to service_role;

comment on function public.platform_perf_analyze(uuid, text) is 'Performance page action: ANALYZE one public table or all. service_role only; operator or owner; audited; one run per target per minute.';
comment on function public.platform_perf_reset_statements(uuid) is 'Performance page action: pg_stat_statements_reset. service_role only; owner; audited.';
comment on function public.platform_perf_end_idle_sessions(uuid, int, boolean) is 'Performance page action: end PostgREST sessions idle in a transaction. Dry run by default. service_role only; owner; audited.';
comment on function public.platform_perf_last_runs(uuid) is 'Last run of each Performance action and target. service_role only; any active staff.';

-- ---------------------------------------------------------------------------
-- Snapshot: two extra keys so index findings can name the index (aggregate
-- names and sizes only, like the rest of the snapshot).
-- ---------------------------------------------------------------------------
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
    -- The biggest never-used indexes that back no constraint, by name, so a fix can be written for each.
    'unusedIndexList', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select i.indexrelname as name, i.relname as "table", pg_relation_size(i.indexrelid) as bytes
      from pg_stat_user_indexes i join pg_index x on x.indexrelid = i.indexrelid
      where i.schemaname = 'public' and i.idx_scan = 0 and not x.indisunique and not x.indisprimary
        and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
      order by pg_relation_size(i.indexrelid) desc limit 10) t), '[]'::jsonb),
    -- Indexes that repeat another on the same table (same columns, operator classes, predicate, expressions).
    -- `keep` is one that backs a constraint when there is one; `drop` are the plain copies.
    'duplicateIndexes', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select g.tbl as "table",
             case when cardinality(g.backed) > 0 then g.backed[1] else g.plain[1] end as keep,
             case when cardinality(g.backed) > 0 then g.plain else g.plain[2:] end as "drop"
      from (
        select (select relname from pg_class where oid = x.indrelid) as tbl,
               coalesce(array_agg(ic.relname order by ic.relname) filter (where k.oid is null), '{}') as plain,
               coalesce(array_agg(ic.relname order by ic.relname) filter (where k.oid is not null), '{}') as backed
        from pg_index x
        join pg_class ic on ic.oid = x.indexrelid
        join pg_namespace n on n.oid = ic.relnamespace
        left join pg_constraint k on k.conindid = x.indexrelid
        where n.nspname = 'public' and x.indisvalid
        group by x.indrelid, x.indkey::text, x.indclass::text, x.indisunique,
                 coalesce(pg_get_expr(x.indpred, x.indrelid), ''), coalesce(pg_get_expr(x.indexprs, x.indrelid), '')
        having count(*) > 1
      ) g where cardinality(g.plain) > case when cardinality(g.backed) > 0 then 0 else 1 end
      limit 10) t), '[]'::jsonb),
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
