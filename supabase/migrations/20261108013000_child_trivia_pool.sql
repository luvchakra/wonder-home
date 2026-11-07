-- Kids Trivia, generated cards (story 08-035; the owner 2026-11-07: "WonderHome
-- can ask or tell trivia about those topics every time the child opens the app
-- in a fun way", and the follow-up: "generate batches per topic in the
-- background … store a small pool per topic … cache per topic+age band across
-- households only if it contains no household data").
--
--   trivia_pool              — validated cards per topic key, age band and
--                              language. Platform data: a topic word and an age
--                              band are all it was made from, never a child's
--                              name or anything of a household. Every signed-in
--                              member may read it; only the server writes.
--   trivia_refill_queue      — which topic/band/language pools are low, and the
--                              household whose model and budget will refill it.
--                              Written by the server; its Admins may read it.
--   trivia_generation_usage  — batches written per household per day, for the
--                              cost cap. Server only.
--
-- New tables only: safe in either order with the code (no pool → the built-in
-- cards, as before).
--
-- Rollback: drop table public.trivia_generation_usage, public.trivia_refill_queue, public.trivia_pool;

create table if not exists public.trivia_pool (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null check (char_length(topic_key) between 2 and 40),
  age_band text not null check (age_band in ('young_child', 'older_child', 'teen')),
  language text not null check (language ~ '^[a-z]{2}$'),
  kind text not null check (kind in ('fact', 'quiz')),
  text text not null check (char_length(text) between 8 and 200),
  options jsonb check (options is null or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 3 and 4)),
  answer smallint check (answer is null or answer between 0 and 3),
  explain text check (explain is null or char_length(explain) <= 200),
  source_hint text check (source_hint is null or char_length(source_hint) <= 100),
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  created_at timestamptz not null default now(),
  check ((kind = 'quiz') = (options is not null and answer is not null)),
  unique (topic_key, age_band, language, text)
);

comment on table public.trivia_pool is
  'Kids Trivia cards written by a model for a topic word and an age band, each validated before it was stored. Platform data: no household or child data.';

create index if not exists trivia_pool_topic_idx on public.trivia_pool (topic_key, age_band, language);

create table if not exists public.trivia_refill_queue (
  topic_key text not null check (char_length(topic_key) between 2 and 40),
  age_band text not null check (age_band in ('young_child', 'older_child', 'teen')),
  language text not null check (language ~ '^[a-z]{2}$'),
  label text not null check (char_length(label) between 2 and 40),
  household_id uuid not null references public.households(id) on delete cascade,
  requested_at timestamptz not null default now(),
  next_try_at timestamptz not null default now(),
  attempts smallint not null default 0,
  primary key (topic_key, age_band, language)
);

comment on table public.trivia_refill_queue is
  'Kids Trivia pools that are low, and the household whose model and budget refill them. Server only.';

create index if not exists trivia_refill_queue_due_idx on public.trivia_refill_queue (next_try_at);
create index if not exists trivia_refill_queue_household_idx on public.trivia_refill_queue (household_id);

create table if not exists public.trivia_generation_usage (
  household_id uuid not null references public.households(id) on delete cascade,
  day date not null,
  batches integer not null default 0 check (batches >= 0),
  primary key (household_id, day)
);

comment on table public.trivia_generation_usage is
  'Kids Trivia batches written per household per day (UTC), for the cost cap. Server only.';

-- Supabase grants new tables to anon and authenticated: take that back.
revoke all on public.trivia_pool, public.trivia_refill_queue, public.trivia_generation_usage from anon, authenticated;

alter table public.trivia_pool enable row level security;
alter table public.trivia_refill_queue enable row level security;
alter table public.trivia_generation_usage enable row level security;

-- The queue and the usage are written only by the server; a household's Admins may read their own rows.
drop policy if exists trivia_refill_queue_admin_read on public.trivia_refill_queue;
create policy trivia_refill_queue_admin_read on public.trivia_refill_queue for select to authenticated
  using (household_id in (select wh.admin_households()));
grant select on public.trivia_refill_queue to authenticated;

drop policy if exists trivia_generation_usage_admin_read on public.trivia_generation_usage;
create policy trivia_generation_usage_admin_read on public.trivia_generation_usage for select to authenticated
  using (household_id in (select wh.admin_households()));
grant select on public.trivia_generation_usage to authenticated;

-- Generic cards: any signed-in member may read them; only the server writes.
drop policy if exists trivia_pool_read on public.trivia_pool;
create policy trivia_pool_read on public.trivia_pool for select to authenticated using (true);
grant select on public.trivia_pool to authenticated;
