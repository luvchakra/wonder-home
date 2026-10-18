-- HomeBrain 4.0 (design/HOMEBRAIN-4.0-DEEP-HOUSEHOLD-INTELLIGENCE.md),
-- stories 14-026 (look deeper) and 14-031 (keep it whole).

-- 1. One content-free row per deeper look (§3.7): which parts of the home
--    were read again live, why, whether the live read had something the
--    stored context did not, and how long it took. Closed words and counts
--    only — never the question, never an answer. Written by the server;
--    no session reads or writes it (deny-all RLS).
create table public.homebrain_misses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  domains text[] not null check (cardinality(domains) between 1 and 3),
  trigger text not null check (trigger in ('not_on_record', 'asked_to_look', 'unknown')),
  found boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index homebrain_misses_household_created on public.homebrain_misses (household_id, created_at desc);

alter table public.homebrain_misses enable row level security;
revoke all on public.homebrain_misses from anon, authenticated;
-- (Its grants and deny-all policy follow in 20261018291000.)

comment on table public.homebrain_misses is
  'HomeBrain 4.0 §3.7: one content-free row per deeper look. found = the live read had what the stored household context lacked, so the store was marked stale. Service role only.';

-- 2. The safety net under the stored household context (§3.8): a write that
--    reaches a domain table without going through a service that calls
--    invalidatesContext still marks the household's stored context stale,
--    so the next turn rebuilds it instead of answering from a row older than
--    the write. Only touches a row that is currently fresh, so a bulk write
--    costs one update, not one per row.
create or replace function wh.mark_context_stale() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.household_id;
  else
    target := new.household_id;
  end if;
  if target is not null then
    update public.household_context
       set stale_since = now()
     where household_id = target
       and (stale_since is null or stale_since < built_at);
  end if;
  return null;
end;
$$;

revoke all on function wh.mark_context_stale() from public, anon, authenticated;

do $tables$
declare
  name text;
begin
  foreach name in array array[
    'household_members', 'member_guardians', 'family_events', 'event_guests', 'event_participants', 'availability_exceptions',
    'meals', 'recipes', 'recipe_ingredients', 'consumables', 'shopping_list_entries', 'obligations',
    'school_items', 'school_enrolments', 'school_teachers', 'child_activities',
    'memories', 'food_preferences', 'pets', 'pet_care_needs', 'responsibilities',
    'household_places', 'home_assets', 'service_requests', 'laundry_needs'
  ] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I for each row execute function wh.mark_context_stale()',
      name || '_marks_context_stale', name
    );
  end loop;
end;
$tables$;
