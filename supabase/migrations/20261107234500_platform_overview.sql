-- Platform admin Overview (owner, 2026-11-07: "make the overview more
-- insightful, useful and actionable for the admin").
--
-- One aggregate-only snapshot for the Overview page, in one call ("one call for
-- many counts"): totals, households by plan, a 60-day daily series of growth
-- and use, active households and people for the last and previous 7 and 30
-- days, and the signals behind "Needs you" (open AI key alerts, billing
-- differences, support grants, quiet setups, background-job heartbeats).
--
-- Safe in either order: this only adds a function and indexes. Nothing reads it
-- until the page ships, and the page shows "not measured" if it is missing.
--
-- Access: `service_role` only, reached through adminGrant.platformAdmin. The
-- caller passes the staff profile id the app already verified, and the
-- function checks it again against platform_admins, so a service-role call
-- with any other id gets an error and no data. anon and authenticated cannot
-- execute it.
--
-- Aggregate only: counts, dates and step names. Never a household id or name,
-- a person, an email or any content.
--
-- Bounded: every time-based read is limited to the last 60 days and served by
-- a created_at index added here.

create index if not exists conversation_messages_created_idx on public.conversation_messages (created_at);
create index if not exists home_send_items_created_idx on public.home_send_items (created_at);
create index if not exists homesend_changes_created_idx on public.homesend_changes (created_at);
create index if not exists notification_events_created_idx on public.notification_events (created_at);
create index if not exists audit_events_created_idx on public.audit_events (created_at);
create index if not exists households_created_idx on public.households (created_at);
create index if not exists household_members_created_idx on public.household_members (created_at);

create or replace function public.platform_overview(p_staff_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_from timestamptz := now() - interval '60 days';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
  v_migrations jsonb := null;
begin
  if p_staff_profile_id is null or not exists (
    select 1 from public.platform_admins a
    where a.profile_id = p_staff_profile_id and a.status = 'active'
  ) then
    raise exception 'platform staff only' using errcode = '42501';
  end if;

  -- The migration history lives in the CLI's own schema; a database without it answers null.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select jsonb_build_object(''latest'', max(version), ''count'', count(*)) from supabase_migrations.schema_migrations'
      into v_migrations;
  end if;

  with
  days as (
    select d::date as day from generate_series((v_today - 59)::timestamp, v_today::timestamp, interval '1 day') d
  ),
  -- Who did something, and when: a recorded change, or a HomeTalk turn of their own.
  activity as materialized (
    select (a.created_at at time zone 'Asia/Kolkata')::date as day, a.created_at as at, a.household_id, a.actor_profile_id as profile_id
    from public.audit_events a
    where a.created_at >= v_from and a.household_id is not null and a.actor_profile_id is not null
    union all
    select (m.created_at at time zone 'Asia/Kolkata')::date, m.created_at, m.household_id, hm.profile_id
    from public.conversation_messages m
    join public.conversation_sessions s on s.id = m.session_id
    join public.household_members hm on hm.id = s.member_id
    where m.created_at >= v_from and m.role = 'member' and hm.profile_id is not null
  ),
  -- Each source read once, grouped by day, then laid on the calendar.
  events as (
    select (h.created_at at time zone 'Asia/Kolkata')::date as day, 'newHouseholds' as k from public.households h where h.created_at >= v_from
    union all
    select (hm.created_at at time zone 'Asia/Kolkata')::date, 'newPeople' from public.household_members hm where hm.created_at >= v_from
    union all
    select (m.created_at at time zone 'Asia/Kolkata')::date, 'turns' from public.conversation_messages m where m.created_at >= v_from and m.role = 'member'
    union all
    select (i.created_at at time zone 'Asia/Kolkata')::date, case when i.status = 'failed' then 'homesendFailed' else 'homesendOk' end
    from public.home_send_items i where i.created_at >= v_from
    union all
    select (e.created_at at time zone 'Asia/Kolkata')::date, case when e.event_type = 'delivery_failed' then 'deliveryFailed' else 'remindersDelivered' end
    from public.notification_events e where e.created_at >= v_from and e.event_type in ('sent', 'delivered', 'delivery_failed')
  ),
  event_days as (
    select day,
      count(*) filter (where k = 'newHouseholds') as new_households,
      count(*) filter (where k = 'newPeople') as new_people,
      count(*) filter (where k = 'turns') as turns,
      count(*) filter (where k in ('homesendOk', 'homesendFailed')) as homesend_items,
      count(*) filter (where k = 'homesendFailed') as homesend_failed,
      count(*) filter (where k = 'remindersDelivered') as reminders_delivered,
      count(*) filter (where k = 'deliveryFailed') as delivery_failed
    from events group by day
  ),
  active_days as (
    select day, count(distinct household_id) as active_households, count(distinct profile_id) as active_people
    from activity group by day
  ),
  daily as (
    select d.day,
      coalesce(e.new_households, 0) as new_households, coalesce(e.new_people, 0) as new_people,
      coalesce(a.active_households, 0) as active_households, coalesce(a.active_people, 0) as active_people,
      coalesce(e.turns, 0) as turns, coalesce(e.homesend_items, 0) as homesend_items, coalesce(e.homesend_failed, 0) as homesend_failed,
      coalesce(e.reminders_delivered, 0) as reminders_delivered, coalesce(e.delivery_failed, 0) as delivery_failed
    from days d
    left join event_days e on e.day = d.day
    left join active_days a on a.day = d.day
  ),
  windows as (
    select w.name, w.since, w.until from (values
      ('last7', v_now - interval '7 days', v_now),
      ('prev7', v_now - interval '14 days', v_now - interval '7 days'),
      ('last30', v_now - interval '30 days', v_now),
      ('prev30', v_now - interval '60 days', v_now - interval '30 days')
    ) as w(name, since, until)
  ),
  plan_of as (
    select coalesce(s.plan_key, 'free') as plan_key
    from public.households h
    left join public.household_subscriptions s on s.household_id = h.id
  ),
  last_sign_in as (
    select hm.household_id, max(u.last_sign_in_at) as at
    from public.household_members hm
    join auth.users u on u.id = hm.profile_id
    group by hm.household_id
  )
  select jsonb_build_object(
    'takenAt', v_now,
    'totals', jsonb_build_object(
      'households', (select count(*) from public.households),
      'people', (select count(*) from public.household_members),
      'supportGrantsOpen', (select count(*) from public.support_access_grants g where g.revoked_at is null and g.expires_at > v_now)
    ),
    'byPlan', coalesce((select jsonb_agg(jsonb_build_object('plan', p.plan_key, 'households', p.n) order by p.n desc, p.plan_key)
      from (select plan_key, count(*) as n from plan_of group by plan_key) p), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'day', x.day, 'newHouseholds', x.new_households, 'newPeople', x.new_people,
        'activeHouseholds', x.active_households, 'activePeople', x.active_people,
        'turns', x.turns, 'homesendItems', x.homesend_items, 'homesendFailed', x.homesend_failed,
        'remindersDelivered', x.reminders_delivered, 'deliveryFailed', x.delivery_failed) order by x.day)
      from daily x), '[]'::jsonb),
    'active', (select jsonb_object_agg(w.name, jsonb_build_object(
        'households', (select count(distinct a.household_id) from activity a where a.at >= w.since and a.at < w.until),
        'people', (select count(distinct a.profile_id) from activity a where a.at >= w.since and a.at < w.until)))
      from windows w),
    'homesendAdded', (select jsonb_object_agg(w.name, jsonb_build_object(
        'confirmed', (select count(*) from public.homesend_changes c where c.created_at >= w.since and c.created_at < w.until and c.change_type = 'created' and c.undone_at is null and c.confirmation_state = 'confirmed'),
        'checking', (select count(*) from public.homesend_changes c where c.created_at >= w.since and c.created_at < w.until and c.change_type = 'created' and c.undone_at is null and c.confirmation_state = 'unconfirmed')))
      from windows w),
    'last24h', jsonb_build_object(
      'homesendFailed', (select count(*) from public.home_send_items i where i.created_at >= v_now - interval '24 hours' and i.status = 'failed'),
      'homesendItems', (select count(*) from public.home_send_items i where i.created_at >= v_now - interval '24 hours'),
      'deliveryFailed', (select count(*) from public.notification_events e where e.created_at >= v_now - interval '24 hours' and e.event_type = 'delivery_failed'),
      'delivered', (select count(*) from public.notification_events e where e.created_at >= v_now - interval '24 hours' and e.event_type in ('sent', 'delivered')),
      'hometalkTurns', (select count(*) from public.hometalk_channel_events t where t.created_at >= v_now - interval '24 hours' and not t.replayed),
      'hometalkFailed', (select count(*) from public.hometalk_channel_events t where t.created_at >= v_now - interval '24 hours' and not t.replayed and t.outcome in ('failed', 'provider_error'))
    ),
    'hometalk7d', (select jsonb_build_object(
        'turns', count(*),
        'failed', count(*) filter (where t.outcome in ('failed', 'provider_error')),
        'p95Ms', percentile_disc(0.95) within group (order by t.latency_ms))
      from public.hometalk_channel_events t
      where t.created_at >= v_now - interval '7 days' and not t.replayed),
    -- Households a few days old where nobody has signed in since the day they were set up.
    'quietSetups', (select count(*) from public.households h
      left join last_sign_in l on l.household_id = h.id
      where h.status = 'active' and h.created_at < v_now - interval '3 days'
        and (l.at is null or l.at < h.created_at + interval '1 day')),
    'aiKeyAlerts', coalesce((select jsonb_agg(jsonb_build_object('provider', k.provider, 'kind', k.kind, 'failures', k.failures, 'lastSeenAt', k.last_seen_at) order by k.last_seen_at desc)
      from (select * from public.ai_key_alerts where resolved_at is null order by last_seen_at desc limit 10) k), '[]'::jsonb),
    'billing', jsonb_build_object(
      'openFindings', (select count(*) from public.billing_reconciliation_findings f where f.resolved_at is null),
      'failedPayments7d', (select count(*) from public.payments p where p.created_at >= v_now - interval '7 days' and p.status = 'failed'),
      'lastRun', (select jsonb_build_object('outcome', r.outcome, 'at', coalesce(r.finished_at, r.started_at))
        from public.billing_reconciliation_runs r order by r.started_at desc limit 1)
    ),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('step', j.step, 'runner', j.runner, 'lastOkAt', j.last_ok_at,
        'lastErrorAt', j.last_error_at, 'lastError', j.last_error, 'runUrl', j.run_url) order by j.step)
      from public.platform_job_heartbeats j), '[]'::jsonb),
    'migrations', v_migrations
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_overview(uuid) from public, anon, authenticated;
grant execute on function public.platform_overview(uuid) to service_role;

comment on function public.platform_overview(uuid) is
  'Aggregate counts for the platform-admin Overview page. service_role only; re-checks that the given profile is active platform staff. Never a household id, name or content.';
