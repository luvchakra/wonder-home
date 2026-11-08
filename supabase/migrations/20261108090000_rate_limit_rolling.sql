-- Rolling-window rate limits (2026-11-08).
--
-- `wh.rate_limit_hit` counts in fixed windows aligned to the clock: with a
-- 60-second window, a hit at 09:24:58 and another at 09:25:02 land in two
-- windows and both pass. For a bucket that promises "one run a minute"
-- (HomeSend's "Add all anyway") that is a broken promise, and the E2E nightly
-- caught it. `wh.rate_limit_hit_rolling` counts every hit in the last
-- p_window_seconds instead: each allowed hit is its own row in the same
-- counters table (window_start = the hit's time), a refused hit records
-- nothing, and a per-(bucket, subject) transaction lock makes two
-- simultaneous calls see each other. Same grants as the fixed form: the
-- service role, through the public wrapper, only.

create or replace function wh.rate_limit_hit_rolling(p_bucket text, p_subject text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_window_seconds < 1 or p_max < 1 then
    raise exception 'rate_limit_hit_rolling: window and limit must be positive' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rate_limit:' || p_bucket || ':' || p_subject, 0));

  select coalesce(sum(c.hits), 0) into v_hits
  from public.rate_limit_counters c
  where c.bucket = p_bucket and c.subject = p_subject
    and c.window_start > now() - make_interval(secs => p_window_seconds);
  if v_hits >= p_max then
    return false;
  end if;

  insert into public.rate_limit_counters as c (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, now(), 1)
  on conflict (bucket, subject, window_start) do update set hits = c.hits + 1;

  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  end if;
  return true;
end;
$$;

comment on function wh.rate_limit_hit_rolling(text, text, integer, integer) is
  'Counts one hit for (bucket, subject) if fewer than p_max were allowed in the last p_window_seconds, and returns whether it was allowed.';

create or replace function public.rate_limit_hit_rolling(p_bucket text, p_subject text, p_window_seconds integer, p_max integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select wh.rate_limit_hit_rolling(p_bucket, p_subject, p_window_seconds, p_max);
$$;

revoke execute on function wh.rate_limit_hit_rolling(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_hit_rolling(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit_rolling(text, text, integer, integer) to service_role;
