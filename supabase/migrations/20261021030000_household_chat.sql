-- Household chat (the owner, 2026-10-21: "add an internal chat feature for
-- each member, including household, these chats are more from the
-- perspective of WonderHome related activities, direct link or tasks can be
-- mentioned in the chat so other member can look at them message and take
-- action … bring an option to add members in incremental way").
--
-- `chat_threads`: one 'household' thread per household (every active member
-- is in it), 'direct' threads between two members, and 'group' threads that
-- began as a direct one and had people added. A direct thread is found again
-- by its `direct_key` (the two member ids, sorted), so opening a chat with
-- the same person twice never makes a second one.
--
-- `chat_participants`: who is in a direct or group thread, who added them,
-- and how far each person has read. In the household thread a row exists
-- only to remember how far that person has read.
--
-- `chat_messages`: what someone wrote, and at most one link to something in
-- WonderHome (a bill, a meal, an event, a grocery item…): a path on this
-- site, never another site, chosen on the server from a record the writer
-- can read. A writer can change or take back their own message; taking one
-- back keeps the row (`removed_at`) so a thread's history does not move.
--
-- Every write that needs more than "it is mine" goes through a narrow
-- function: opening a direct thread, adding people, leaving. Messages and
-- read marks are plain RLS.
--
-- Rollback: drop function public.chat_open_direct(uuid); drop function
-- public.chat_add_participants(uuid, uuid[]); drop function public.chat_leave(uuid);
-- drop function public.chat_mark_read(uuid); drop function public.chat_inbox(uuid);
-- drop table public.chat_messages; drop table public.chat_participants;
-- drop table public.chat_threads; drop function wh.my_chat_threads();

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('household', 'direct', 'group')),
  title text check (title is null or char_length(title) between 1 and 80),
  direct_key text,
  created_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'direct') = (direct_key is not null))
);

comment on table public.chat_threads is
  'Household chat threads: one household thread, direct threads between two members, groups grown from a direct thread. Members read the threads they are in; writes go through chat_* functions.';

create unique index if not exists chat_threads_one_household on public.chat_threads (household_id) where kind = 'household';
create unique index if not exists chat_threads_direct_key on public.chat_threads (household_id, direct_key) where kind = 'direct';
create index if not exists chat_threads_created_by_idx on public.chat_threads (created_by);

create or replace trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function wh.set_updated_at();

create table if not exists public.chat_participants (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  added_by uuid references public.household_members(id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  primary key (thread_id, member_id)
);

comment on table public.chat_participants is
  'Who is in a direct or group chat (and who added them), and how far each person has read. In the household thread a row only remembers how far someone has read.';

create index if not exists chat_participants_member_idx on public.chat_participants (member_id, thread_id);
create index if not exists chat_participants_household_idx on public.chat_participants (household_id);
create index if not exists chat_participants_added_by_idx on public.chat_participants (added_by);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  author_member_id uuid not null references public.household_members(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  link_kind text check (link_kind is null or link_kind in ('bill', 'meal', 'event', 'grocery', 'school', 'home', 'health', 'responsibility', 'page')),
  link_path text check (
    link_path is null
    or (link_path like '/%' and link_path not like '//%' and position(E'\\' in link_path) = 0 and char_length(link_path) <= 300)
  ),
  link_label text check (link_label is null or char_length(link_label) between 1 and 160),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  removed_at timestamptz,
  check ((link_path is null) = (link_label is null))
);

comment on table public.chat_messages is
  'A message in a household chat, with at most one link to something in WonderHome (a path on this site). The writer may change or take it back; a taken-back message keeps its row.';

create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at desc);
create index if not exists chat_messages_household_idx on public.chat_messages (household_id);
create index if not exists chat_messages_author_idx on public.chat_messages (author_member_id);

-- The threads the caller is in, once per statement: the household thread of
-- every household they are an active member of, and every direct or group
-- thread they have not left.
create or replace function wh.my_chat_threads()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select t.id
  from public.chat_threads t
  join public.household_members m on m.household_id = t.household_id
  where m.profile_id = auth.uid() and m.status = 'active' and t.kind = 'household'
  union
  select p.thread_id
  from public.chat_participants p
  join public.household_members m on m.id = p.member_id
  where m.profile_id = auth.uid() and m.status = 'active' and p.left_at is null;
$$;

comment on function wh.my_chat_threads() is
  'The chat threads the caller is in. Set form, for policies: evaluated once per statement.';

revoke all on function wh.my_chat_threads() from public;
grant execute on function wh.my_chat_threads() to authenticated;

alter table public.chat_threads enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_threads_read on public.chat_threads;
create policy chat_threads_read on public.chat_threads for select
  to authenticated
  using (id in (select wh.my_chat_threads()));

-- A thread's people are visible to everyone in it.
drop policy if exists chat_participants_read on public.chat_participants;
create policy chat_participants_read on public.chat_participants for select
  to authenticated
  using (thread_id in (select wh.my_chat_threads()));

drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select
  to authenticated
  using (thread_id in (select wh.my_chat_threads()));

-- Writing: as yourself, into a thread you are in, in that thread's household.
drop policy if exists chat_messages_insert_own on public.chat_messages;
create policy chat_messages_insert_own on public.chat_messages for insert
  to authenticated
  with check (
    thread_id in (select wh.my_chat_threads())
    and (household_id, author_member_id) in (select household_id, member_id from wh.my_memberships())
    and removed_at is null
    and edited_at is null
  );

-- Changing or taking back your own message, and nothing else about it.
drop policy if exists chat_messages_update_own on public.chat_messages;
create policy chat_messages_update_own on public.chat_messages for update
  to authenticated
  using ((household_id, author_member_id) in (select household_id, member_id from wh.my_memberships()))
  with check ((household_id, author_member_id) in (select household_id, member_id from wh.my_memberships()));

-- Threads and who is in them change only through the chat_* functions below;
-- nothing ever deletes a message (a taken-back one keeps its row).
revoke insert, update, delete on public.chat_threads from authenticated, anon;
revoke insert, update, delete on public.chat_participants from authenticated, anon;
revoke update, delete on public.chat_messages from authenticated, anon;
revoke all on public.chat_threads, public.chat_participants, public.chat_messages from anon;
grant select on public.chat_threads to authenticated;
grant select on public.chat_participants to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant update (body, link_kind, link_path, link_label, edited_at, removed_at) on public.chat_messages to authenticated;

-- A message must belong to its thread's household, and only its words, its
-- link and its edited/removed marks may ever change.
create or replace function wh.chat_message_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.chat_threads t where t.id = new.thread_id and t.household_id = new.household_id) then
      raise exception 'chat message must belong to its thread''s household' using errcode = '42501';
    end if;
    update public.chat_threads set last_message_at = new.created_at where id = new.thread_id;
    return new;
  end if;
  if new.thread_id <> old.thread_id or new.household_id <> old.household_id
     or new.author_member_id <> old.author_member_id or new.created_at <> old.created_at then
    raise exception 'only a message''s words and link can change' using errcode = '42501';
  end if;
  if old.removed_at is not null then
    raise exception 'a message taken back stays taken back' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger chat_messages_guard
  before insert or update on public.chat_messages
  for each row execute function wh.chat_message_guard();

-- The caller's member id in a household, or an error.
create or replace function wh.chat_me(p_household uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.id from public.household_members m
  where m.household_id = p_household and m.profile_id = auth.uid() and m.status = 'active'
  limit 1;
$$;

revoke all on function wh.chat_me(uuid) from public;

-- Opens the household thread, made the first time anyone asks for it.
create or replace function public.chat_household_thread(p_household uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_me uuid := wh.chat_me(p_household);
  v_thread uuid;
begin
  if v_me is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select id into v_thread from public.chat_threads where household_id = p_household and kind = 'household';
  if v_thread is null then
    insert into public.chat_threads (household_id, kind, created_by)
    values (p_household, 'household', v_me)
    on conflict do nothing
    returning id into v_thread;
    if v_thread is null then
      select id into v_thread from public.chat_threads where household_id = p_household and kind = 'household';
    end if;
  end if;
  return v_thread;
end;
$$;

-- Opens (or finds) the direct thread between the caller and another active
-- member of the same household.
create or replace function public.chat_open_direct(p_member uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_household uuid;
  v_me uuid;
  v_key text;
  v_thread uuid;
begin
  select household_id into v_household from public.household_members where id = p_member and status = 'active';
  if v_household is null then
    raise exception 'that person is not in a household' using errcode = '42501';
  end if;
  v_me := wh.chat_me(v_household);
  if v_me is null or v_me = p_member then
    raise exception 'a chat is between two people in the same household' using errcode = '42501';
  end if;
  v_key := least(v_me::text, p_member::text) || ':' || greatest(v_me::text, p_member::text);
  select id into v_thread from public.chat_threads where household_id = v_household and kind = 'direct' and direct_key = v_key;
  if v_thread is null then
    insert into public.chat_threads (household_id, kind, direct_key, created_by)
    values (v_household, 'direct', v_key, v_me)
    on conflict do nothing
    returning id into v_thread;
    if v_thread is null then
      select id into v_thread from public.chat_threads where household_id = v_household and kind = 'direct' and direct_key = v_key;
    end if;
  end if;
  insert into public.chat_participants (thread_id, household_id, member_id, added_by)
  values (v_thread, v_household, v_me, v_me), (v_thread, v_household, p_member, v_me)
  on conflict (thread_id, member_id) do update set left_at = null where public.chat_participants.member_id = v_me;
  return v_thread;
end;
$$;

-- Adds people to a direct or group thread the caller is in. A direct thread
-- that gains a third person becomes a group (it keeps its history); the two
-- of them can then open a new direct thread between themselves again.
create or replace function public.chat_add_participants(p_thread uuid, p_members uuid[])
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_thread public.chat_threads;
  v_me uuid;
  v_added integer := 0;
  v_member uuid;
begin
  select * into v_thread from public.chat_threads where id = p_thread;
  if v_thread.id is null or v_thread.kind = 'household' then
    raise exception 'people are added to a direct or group chat' using errcode = '42501';
  end if;
  v_me := wh.chat_me(v_thread.household_id);
  if v_me is null or not exists (
    select 1 from public.chat_participants where thread_id = p_thread and member_id = v_me and left_at is null
  ) then
    raise exception 'only someone in the chat can add people' using errcode = '42501';
  end if;
  if coalesce(array_length(p_members, 1), 0) = 0 or array_length(p_members, 1) > 50 then
    raise exception 'add between one and fifty people' using errcode = '22023';
  end if;
  foreach v_member in array p_members loop
    if not exists (select 1 from public.household_members where id = v_member and household_id = v_thread.household_id and status = 'active') then
      raise exception 'everyone added must be in this household' using errcode = '42501';
    end if;
    insert into public.chat_participants (thread_id, household_id, member_id, added_by)
    values (p_thread, v_thread.household_id, v_member, v_me)
    on conflict (thread_id, member_id) do update set left_at = null, added_by = excluded.added_by, joined_at = now()
      where public.chat_participants.left_at is not null;
    if found then v_added := v_added + 1; end if;
  end loop;
  if v_thread.kind = 'direct' and (select count(*) from public.chat_participants where thread_id = p_thread and left_at is null) > 2 then
    update public.chat_threads set kind = 'group', direct_key = null where id = p_thread;
  end if;
  return v_added;
end;
$$;

-- Leaves a group thread. The household thread is everyone's, and a direct
-- thread is simply not opened; neither can be left.
create or replace function public.chat_leave(p_thread uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_thread public.chat_threads;
  v_me uuid;
begin
  select * into v_thread from public.chat_threads where id = p_thread;
  if v_thread.id is null or v_thread.kind <> 'group' then
    raise exception 'only a group chat can be left' using errcode = '42501';
  end if;
  v_me := wh.chat_me(v_thread.household_id);
  update public.chat_participants set left_at = now() where thread_id = p_thread and member_id = v_me and left_at is null;
end;
$$;

-- Marks a thread read up to now for the caller.
create or replace function public.chat_mark_read(p_thread uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_thread public.chat_threads;
  v_me uuid;
begin
  select * into v_thread from public.chat_threads where id = p_thread and id in (select wh.my_chat_threads());
  if v_thread.id is null then
    raise exception 'not in this chat' using errcode = '42501';
  end if;
  v_me := wh.chat_me(v_thread.household_id);
  insert into public.chat_participants (thread_id, household_id, member_id, added_by, last_read_at)
  values (p_thread, v_thread.household_id, v_me, v_me, now())
  on conflict (thread_id, member_id) do update set last_read_at = now();
end;
$$;

-- The caller's chats in one household, newest first, each with its last
-- message and how many messages from others arrived since they last read it.
-- Security invoker: it reads only what the caller's own RLS lets them read.
create or replace function public.chat_inbox(p_household uuid)
  returns table (
    thread_id uuid,
    kind text,
    title text,
    last_message_at timestamptz,
    last_body text,
    last_author uuid,
    last_removed boolean,
    unread integer,
    people uuid[]
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with me as (
    select m.member_id from wh.my_memberships() m where m.household_id = p_household
  ),
  threads as (
    select t.* from public.chat_threads t where t.household_id = p_household
  )
  select
    t.id,
    t.kind,
    t.title,
    t.last_message_at,
    last.body,
    last.author_member_id,
    last.removed_at is not null,
    (
      select count(*)::integer from public.chat_messages cm
      where cm.thread_id = t.id
        and cm.author_member_id not in (select member_id from me)
        and cm.removed_at is null
        and cm.created_at > coalesce(
          (select p.last_read_at from public.chat_participants p where p.thread_id = t.id and p.member_id in (select member_id from me)),
          '-infinity'::timestamptz
        )
    ),
    coalesce(
      (select array_agg(p.member_id order by p.joined_at) from public.chat_participants p where p.thread_id = t.id and p.left_at is null and t.kind <> 'household'),
      '{}'::uuid[]
    )
  from threads t
  left join lateral (
    select cm.body, cm.author_member_id, cm.removed_at from public.chat_messages cm
    where cm.thread_id = t.id order by cm.created_at desc limit 1
  ) last on true
  order by coalesce(t.last_message_at, t.created_at) desc
  limit 100;
$$;

revoke all on function public.chat_household_thread(uuid) from public;
revoke all on function public.chat_open_direct(uuid) from public;
revoke all on function public.chat_add_participants(uuid, uuid[]) from public;
revoke all on function public.chat_leave(uuid) from public;
revoke all on function public.chat_mark_read(uuid) from public;
revoke all on function public.chat_inbox(uuid) from public;
grant execute on function public.chat_household_thread(uuid) to authenticated;
grant execute on function public.chat_open_direct(uuid) to authenticated;
grant execute on function public.chat_add_participants(uuid, uuid[]) to authenticated;
grant execute on function public.chat_leave(uuid) to authenticated;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_inbox(uuid) to authenticated;
