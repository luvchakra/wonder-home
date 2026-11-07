-- Kids Trivia (story 08-034, the owner 2026-11-07: "in kids version, create a
-- trivia section, where child can choose topic of interest, then WonderHome
-- can ask or tell trivia about those topics every time the child opens the app
-- in a fun way").
--
-- Four household tables, all about one child:
--   trivia_profiles   — on/off (a guardian's or an Admin's to set) and how
--                       hard the child likes it (the child's own "too hard /
--                       too easy").
--   trivia_topics     — what the child loves, as they typed or picked it, once
--                       it passed the safety check. Written only by the server
--                       after that check (no insert right from a session).
--   trivia_rejections — a topic the check turned away: never the words, only a
--                       hash and a reason code, for the guardian.
--   trivia_shown      — each card shown, newest first: no repeats, the quiz
--                       streak, and "what was shown" for the guardian. Written
--                       only by the server.
--
-- Who sees: the child, their guardians and the household's Admins (the set
-- forms of wh.may_see_child). Who changes on/off and removes topics: the
-- child removes their own; a guardian or an Admin removes any and turns
-- Trivia off. New tables only: safe in either order with the code (a
-- database without them shows no trivia card and no guardian control).
--
-- Rollback: drop table public.trivia_shown, public.trivia_rejections,
-- public.trivia_topics, public.trivia_profiles; drop function
-- wh.trivia_profile_guard().

create table if not exists public.trivia_profiles (
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  enabled boolean not null default true,
  level smallint not null default 2 check (level between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (member_id)
);

comment on table public.trivia_profiles is
  'Kids Trivia per child: on/off (guardian or Admin) and the difficulty the child picked (1 easier – 3 harder).';

create index if not exists trivia_profiles_household_idx on public.trivia_profiles (household_id);

create table if not exists public.trivia_topics (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 40),
  topic_key text not null check (topic_key ~ '^[^A-Z]{2,40}$'),
  checked_by text not null default 'rules' check (checked_by in ('rules', 'model')),
  created_at timestamptz not null default now(),
  unique (member_id, topic_key)
);

comment on table public.trivia_topics is
  'Topics a child loves (Kids Trivia). Stored only after the safety check; the server writes them, a session reads and removes.';

create index if not exists trivia_topics_household_member_idx on public.trivia_topics (household_id, member_id);

create table if not exists public.trivia_rejections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  topic_hash text not null check (topic_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('violence', 'sexual', 'drugs', 'self_harm', 'hate', 'gambling', 'scary', 'private_person', 'not_a_topic')),
  created_at timestamptz not null default now()
);

comment on table public.trivia_rejections is
  'A topic the Kids Trivia safety check turned away: a hash and a reason code only, never the words.';

create index if not exists trivia_rejections_household_member_idx on public.trivia_rejections (household_id, member_id, created_at desc);

create table if not exists public.trivia_shown (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 3 and 80),
  kind text not null check (kind in ('fact', 'quiz')),
  topic text not null check (char_length(topic) between 1 and 40),
  text text not null check (char_length(text) between 1 and 400),
  answered_correct boolean,
  shown_at timestamptz not null default now()
);

comment on table public.trivia_shown is
  'Each Kids Trivia card shown to a child: for no repeats, the quiz streak and the guardian''s "what was shown". Written by the server.';

create index if not exists trivia_shown_household_member_idx on public.trivia_shown (household_id, member_id, shown_at desc);
create index if not exists trivia_shown_member_idx on public.trivia_shown (member_id);

-- Supabase grants every new table to anon and authenticated by default: take
-- that back, then grant only what each table allows below.
revoke all on public.trivia_profiles, public.trivia_topics, public.trivia_rejections, public.trivia_shown from anon, authenticated;

alter table public.trivia_profiles enable row level security;
alter table public.trivia_topics enable row level security;
alter table public.trivia_rejections enable row level security;
alter table public.trivia_shown enable row level security;

-- Seen by the child, their guardians and the household's Admins.
drop policy if exists trivia_profiles_read on public.trivia_profiles;
create policy trivia_profiles_read on public.trivia_profiles for select to authenticated
  using (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()));

-- The child sets their own difficulty; a guardian or an Admin also turns it on or off (the trigger below).
drop policy if exists trivia_profiles_insert on public.trivia_profiles;
create policy trivia_profiles_insert on public.trivia_profiles for insert to authenticated
  with check (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()));

drop policy if exists trivia_profiles_update on public.trivia_profiles;
create policy trivia_profiles_update on public.trivia_profiles for update to authenticated
  using (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()))
  with check (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()));

grant select, insert, update (enabled, level, updated_at) on public.trivia_profiles to authenticated;

-- On/off is a guardian's or an Admin's: a child cannot turn their own Trivia back on.
create or replace function wh.trivia_profile_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- the server (service role)
  end if;
  if (tg_op = 'INSERT' and new.enabled is distinct from true) or (tg_op = 'UPDATE' and new.enabled is distinct from old.enabled) then
    if not (new.household_id in (select wh.admin_households())
      or (new.household_id, new.member_id) in (select household_id, child_member_id from wh.my_guarded_children())) then
      raise exception 'only a guardian or an Admin turns Trivia on or off' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trivia_profiles_guard on public.trivia_profiles;
create trigger trivia_profiles_guard before insert or update on public.trivia_profiles
  for each row execute function wh.trivia_profile_guard();

drop policy if exists trivia_topics_read on public.trivia_topics;
create policy trivia_topics_read on public.trivia_topics for select to authenticated
  using (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()));

-- The child removes their own; a guardian or an Admin removes any of the child's.
drop policy if exists trivia_topics_delete on public.trivia_topics;
create policy trivia_topics_delete on public.trivia_topics for delete to authenticated
  using (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()));

grant select, delete on public.trivia_topics to authenticated;

-- A turned-away topic is for the guardian and the Admins, not a list for the child to read back.
drop policy if exists trivia_rejections_read on public.trivia_rejections;
create policy trivia_rejections_read on public.trivia_rejections for select to authenticated
  using (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()));

grant select on public.trivia_rejections to authenticated;

drop policy if exists trivia_shown_read on public.trivia_shown;
create policy trivia_shown_read on public.trivia_shown for select to authenticated
  using (household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (household_id, member_id) in (select household_id, child_member_id from wh.my_guarded_children()));

grant select on public.trivia_shown to authenticated;
