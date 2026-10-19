-- HomeBrain Sleep (HomeBrain 5.0, the owner, 2026-10-19).
--
-- The human brain records the day fast (hippocampus), and while it sleeps it
-- replays it: duplicates are merged into what it already knows (cortex),
-- what matters is kept strong (amygdala), what is never used fades, and
-- distant memories are linked (REM). HomeBrain had the fast recording and
-- none of the sleep, so the same preference piled up three times and a
-- sentence about two people was filed under one.
--
-- Everything here is additive: no existing column, constraint or policy
-- changes. The nightly run and its undo write with the service role.
--
--   memories            + salience, tier (active / resting / expired),
--                         valid_until, merged_into
--   homebrain_recall    how often an answer used a memory, and when: kept
--                       apart from memories so a turn's count never marks
--                       the context store stale
--   homebrain_runs      one night's sleep per household per local day
--   homebrain_consolidations
--                       what a night changed, with what it was before, so
--                       each change can be undone (Admins read it)
--   homebrain_links     associations between records (REM)
--   homebrain_embeddings
--                       meaning, for finding the same thing said two ways,
--                       where the database has pgvector

-- --- How strong a memory is ------------------------------------------------

alter table public.memories
  add column if not exists salience smallint not null default 1 check (salience between 0 and 3),
  add column if not exists tier text not null default 'active' check (tier in ('active', 'resting', 'expired')),
  add column if not exists valid_until date,
  add column if not exists merged_into uuid references public.memories(id) on delete set null;

comment on column public.memories.salience is 'How much it matters (0-3): health, allergy, safety and a child''s needs are 3 and never fade.';
comment on column public.memories.tier is 'active: in every answer; resting: faded from use, still found when HomeBrain looks deeper; expired: its time has passed.';
comment on column public.memories.merged_into is 'The memory a night''s sleep folded this one into.';

create index if not exists memories_merged_into_idx on public.memories (merged_into) where merged_into is not null;
create index if not exists memories_household_tier_idx on public.memories (household_id, tier) where status in ('learned', 'confirmed');

-- --- Being recalled -------------------------------------------------------------

create table if not exists public.homebrain_recall (
  memory_id uuid primary key references public.memories(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  recall_count integer not null default 0 check (recall_count >= 0),
  last_recalled_at timestamptz not null default now()
);
create index if not exists homebrain_recall_household_idx on public.homebrain_recall (household_id);

alter table public.homebrain_recall enable row level security;
grant select, insert, update, delete on public.homebrain_recall to anon, authenticated;
create policy homebrain_recall_no_client_access on public.homebrain_recall for all to anon, authenticated using (false) with check (false);

-- One answer's citations, counted in one statement. Only memories of this household are counted.
create or replace function public.homebrain_recalled(p_household_id uuid, p_memory_ids uuid[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.homebrain_recall (memory_id, household_id, recall_count, last_recalled_at)
  select m.id, m.household_id, 1, now()
    from public.memories m
   where m.household_id = p_household_id
     and m.id = any (p_memory_ids[1:50])
  on conflict (memory_id) do update
    set recall_count = public.homebrain_recall.recall_count + 1,
        last_recalled_at = now();
$$;
revoke all on function public.homebrain_recalled(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.homebrain_recalled(uuid, uuid[]) to service_role;

-- --- A night's sleep --------------------------------------------------------------

create table if not exists public.homebrain_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  local_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null default 'running' check (outcome in ('running', 'done', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  -- Which provider took part, or null when the night was rules only.
  model_provider text check (model_provider in ('anthropic', 'google', 'openai')),
  unique (household_id, local_date)
);
create index if not exists homebrain_runs_household_idx on public.homebrain_runs (household_id, local_date desc);

alter table public.homebrain_runs enable row level security;
grant select on public.homebrain_runs to authenticated;
create policy homebrain_runs_admin_read on public.homebrain_runs for select to authenticated
  using (household_id in (select wh.admin_households()));

create table if not exists public.homebrain_consolidations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  run_id uuid references public.homebrain_runs(id) on delete set null,
  kind text not null check (kind in ('merged', 'split', 'expired', 'rested', 'reattributed', 'linked', 'conflict')),
  memory_ids uuid[] not null default '{}',
  -- The fact a change left, in the household's own words: what the Learned tab shows.
  statement text not null check (char_length(statement) between 1 and 400),
  -- What each memory was before, so the change can be undone exactly.
  detail jsonb not null default '{}'::jsonb,
  by_model boolean not null default false,
  undone_at timestamptz,
  undone_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists homebrain_consolidations_household_idx on public.homebrain_consolidations (household_id, created_at desc);
create index if not exists homebrain_consolidations_run_idx on public.homebrain_consolidations (run_id);
create index if not exists homebrain_consolidations_undone_by_idx on public.homebrain_consolidations (undone_by) where undone_by is not null;

alter table public.homebrain_consolidations enable row level security;
grant select on public.homebrain_consolidations to authenticated;
create policy homebrain_consolidations_admin_read on public.homebrain_consolidations for select to authenticated
  using (household_id in (select wh.admin_households()));

-- --- Associations (REM) -------------------------------------------------------------

create table if not exists public.homebrain_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Context item ids ("memory:<uuid>", "meal:<uuid>"): the store's own.
  from_item text not null check (char_length(from_item) between 3 and 120),
  to_item text not null check (char_length(to_item) between 3 and 120),
  kind text not null check (kind in ('likes_what_is_planned', 'same_thing', 'part_of', 'related')),
  reason text not null check (char_length(reason) between 1 and 200),
  strength real not null default 0.5 check (strength between 0 and 1),
  by_model boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, from_item, to_item),
  check (from_item <> to_item)
);
create index if not exists homebrain_links_household_idx on public.homebrain_links (household_id);

alter table public.homebrain_links enable row level security;
grant select on public.homebrain_links to authenticated;
create policy homebrain_links_admin_read on public.homebrain_links for select to authenticated
  using (household_id in (select wh.admin_households()));

-- A new link changes what a turn can follow: the stored context is rebuilt.
create trigger homebrain_links_mark_context_stale
  after insert or update or delete on public.homebrain_links
  for each row execute function wh.mark_context_stale();

-- --- Meaning (pgvector) ------------------------------------------------------------
-- Only where the database offers pgvector (the hosted project does). Without
-- it, duplicates are found by words alone and nothing else changes.

do $vector$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create schema if not exists extensions;
    create extension if not exists vector with schema extensions;

    execute $ddl$
      create table if not exists public.homebrain_embeddings (
        household_id uuid not null references public.households(id) on delete cascade,
        item_id text not null check (char_length(item_id) between 3 and 120),
        -- Vectors from two models are never compared.
        model text not null check (char_length(model) between 1 and 80),
        content_hash text not null,
        privacy_class text not null,
        embedding extensions.vector(768) not null,
        updated_at timestamptz not null default now(),
        primary key (household_id, model, item_id)
      )
    $ddl$;
    execute 'alter table public.homebrain_embeddings enable row level security';
    execute 'grant select, insert, update, delete on public.homebrain_embeddings to anon, authenticated';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'homebrain_embeddings') then
      execute 'create policy homebrain_embeddings_no_client_access on public.homebrain_embeddings for all to anon, authenticated using (false) with check (false)';
    end if;

    -- A household holds hundreds of records, not millions: an exact scan of
    -- its own rows (by the primary key's household prefix) is faster and
    -- truer than an approximate index filtered after the fact.
    execute $fn$
      create or replace function public.match_homebrain_embeddings(p_household_id uuid, p_model text, p_query extensions.vector, p_limit integer default 12)
      returns table (item_id text, similarity real)
      language sql
      stable
      security definer
      set search_path = public, extensions, pg_temp
      as $body$
        select e.item_id, (1 - (e.embedding <=> p_query))::real
          from public.homebrain_embeddings e
         where e.household_id = p_household_id
           and e.model = p_model
         order by e.embedding <=> p_query
         limit least(greatest(p_limit, 1), 50)
      $body$
    $fn$;
    execute 'revoke all on function public.match_homebrain_embeddings(uuid, text, extensions.vector, integer) from public, anon, authenticated';
    execute 'grant execute on function public.match_homebrain_embeddings(uuid, text, extensions.vector, integer) to service_role';
  end if;
end
$vector$;
