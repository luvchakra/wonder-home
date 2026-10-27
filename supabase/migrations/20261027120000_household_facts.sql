-- The household record index, Phase 2 (story 14-037, design/HOUSEHOLD-RECORD-INDEX.md §4):
-- facts written when records are written.
--
-- 1. `household_facts`: one row per record (one per occurrence, later, for
--    repeating things), as the HomeBrain fact the registry's describer makes,
--    with its people, day, privacy and a search vector. Derived and
--    rebuildable, like `household_context`; deny-all to every session.
-- 2. `knowledge_outbox`: `(household, table, id)` queued by a generic trigger
--    on every registered table in a stored domain. A worker describes each
--    queued row and upserts (or deletes) its fact after the response; a turn
--    drains its own household's queue before it answers.
--
-- Safe in either order. Before the code ships, the trigger only queues (the
-- rows wait, one per record, deduplicated). Before this migration, the code
-- finds no `household_facts` and keeps reading these tables into the stored
-- context as it did.

-- 1. The facts ----------------------------------------------------------------

create table public.household_facts (
  household_id uuid not null references public.households(id) on delete cascade,
  source_table text not null check (length(source_table) between 1 and 63),
  source_id text not null check (length(source_id) between 1 and 200),
  -- '' for the record itself; an occurrence's own key for repeating things (Phase 3).
  fact_key text not null default '' check (length(fact_key) <= 100),
  domain text not null,
  entity_type text not null,
  title text not null default '',
  summary text not null,
  privacy text not null,
  health_scope text,
  subjects uuid[] not null default '{}',
  -- The local day it is about, when it has one.
  day date,
  -- The describer's own word on whether it is current; null means "by its day".
  current boolean,
  -- When the record leaves its table's window (the registry's `since`); null for never.
  expires_at timestamptz,
  -- The whole `HouseholdContextItem`, as the describer made it.
  item jsonb not null,
  search tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, ''))) stored,
  written_at timestamptz not null default now(),
  primary key (household_id, source_table, source_id, fact_key)
);

comment on table public.household_facts is
  'Record index Phase 2: one HomeBrain fact per registered record, written by the knowledge worker when the record is written. Server-only; the viewer filter runs in memory before anything leaves.';

create index household_facts_day_idx on public.household_facts (household_id, day);
create index household_facts_search_idx on public.household_facts using gin (search);

alter table public.household_facts enable row level security;
grant select, insert, update, delete on public.household_facts to anon, authenticated, service_role;

create policy household_facts_no_client_access
  on public.household_facts for all
  to anon, authenticated
  using (false)
  with check (false);

-- 2. The outbox ---------------------------------------------------------------
-- No foreign key to households: a household's delete cascades into its
-- records, whose triggers queue here inside that same delete, and a key
-- would refuse those rows and with them the delete. The worker drops rows
-- whose household is gone.

create table public.knowledge_outbox (
  household_id uuid not null,
  source_table text not null,
  source_id text not null,
  queued_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  claim_token uuid,
  attempts smallint not null default 0,
  primary key (household_id, source_table, source_id)
);

comment on table public.knowledge_outbox is
  'Record index Phase 2: registered records written since their fact was last made. Queued by wh.queue_knowledge, drained by the knowledge worker. Server-only.';

create index knowledge_outbox_queued_idx on public.knowledge_outbox (queued_at);
create index knowledge_outbox_claim_idx on public.knowledge_outbox (claim_token) where claim_token is not null;

alter table public.knowledge_outbox enable row level security;
grant select, insert, update, delete on public.knowledge_outbox to anon, authenticated, service_role;

create policy knowledge_outbox_no_client_access
  on public.knowledge_outbox for all
  to anon, authenticated
  using (false)
  with check (false);

-- 3. The trigger ----------------------------------------------------------------
-- One row per record however often it is written: a write while it waits
-- moves `queued_at` on, which also tells a worker already holding it that
-- it changed again.

create or replace function wh.queue_knowledge() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  written jsonb;
  before jsonb;
begin
  if tg_op <> 'DELETE' then
    written := to_jsonb(new);
    if written ->> 'household_id' is not null and written ->> 'id' is not null then
      insert into public.knowledge_outbox (household_id, source_table, source_id)
      values ((written ->> 'household_id')::uuid, tg_table_name, written ->> 'id')
      on conflict (household_id, source_table, source_id) do update set queued_at = clock_timestamp();
    end if;
  end if;
  if tg_op <> 'INSERT' then
    before := to_jsonb(old);
    if before ->> 'household_id' is not null and before ->> 'id' is not null
       and (written is null or (written ->> 'household_id') is distinct from (before ->> 'household_id') or (written ->> 'id') is distinct from (before ->> 'id')) then
      insert into public.knowledge_outbox (household_id, source_table, source_id)
      values ((before ->> 'household_id')::uuid, tg_table_name, before ->> 'id')
      on conflict (household_id, source_table, source_id) do update set queued_at = clock_timestamp();
    end if;
  end if;
  return null;
end;
$$;

revoke all on function wh.queue_knowledge() from public, anon, authenticated;

-- The registered tables in a stored domain (`knowledge/facts.ts` FACT_TABLES).
-- People and health stay read live for the person asking, so they are not here.
do $tables$
declare
  name text;
begin
  foreach name in array array[
    'asset_service_events', 'backup_services', 'budgets', 'child_goal_checkins', 'child_goals',
    'consumable_purchases', 'event_exceptions', 'gift_plans', 'meal_week_template_options',
    'order_items', 'routines', 'school_documents', 'school_teachers', 'study_sessions'
  ] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I for each row execute function wh.queue_knowledge()',
      name || '_queues_knowledge', name
    );
    -- Every record already there gets its fact on the first drain.
    execute format(
      'insert into public.knowledge_outbox (household_id, source_table, source_id) select household_id, %L, id::text from public.%I where household_id is not null on conflict do nothing',
      name, name
    );
  end loop;
end;
$tables$;

-- 4. The worker's claim -----------------------------------------------------------
-- A claim lasts a minute; another worker (a turn, the clock, another
-- instance) skips what is claimed. Server only.

create or replace function public.claim_knowledge_outbox(p_household_id uuid, p_limit integer, p_token uuid)
returns table (household_id uuid, source_table text, source_id text)
  language sql
  set search_path = public, pg_temp
as $$
  update public.knowledge_outbox as o
     set claimed_at = clock_timestamp(), claim_token = p_token
   where (o.household_id, o.source_table, o.source_id) in (
     select q.household_id, q.source_table, q.source_id
       from public.knowledge_outbox as q
      where (p_household_id is null or q.household_id = p_household_id)
        and (q.claimed_at is null or q.claimed_at < clock_timestamp() - interval '60 seconds')
      order by q.queued_at
      limit greatest(1, least(p_limit, 500))
        for update skip locked
   )
  returning o.household_id, o.source_table, o.source_id;
$$;

-- Done rows go, unless they were written again while held. Failed ones are
-- let go to be tried again, five times at most.
create or replace function public.finish_knowledge_outbox(p_token uuid, p_failed jsonb default '[]'::jsonb)
returns void
  language sql
  set search_path = public, pg_temp
as $$
  delete from public.knowledge_outbox as o
   where o.claim_token = p_token
     and o.queued_at <= o.claimed_at
     and not exists (
       select 1 from jsonb_array_elements(p_failed) as f
        where f ->> 'table' = o.source_table and f ->> 'id' = o.source_id
     );
  delete from public.knowledge_outbox as o
   where o.claim_token = p_token and o.attempts >= 4;
  update public.knowledge_outbox as o
     set claimed_at = null, claim_token = null,
         attempts = o.attempts + case when exists (
           select 1 from jsonb_array_elements(p_failed) as f
            where f ->> 'table' = o.source_table and f ->> 'id' = o.source_id
         ) then 1 else 0 end
   where o.claim_token = p_token;
$$;

revoke all on function public.claim_knowledge_outbox(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.finish_knowledge_outbox(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_knowledge_outbox(uuid, integer, uuid) to service_role;
grant execute on function public.finish_knowledge_outbox(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
