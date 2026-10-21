-- Reacting to a chat message (the owner, 2026-10-21: "add feature for
-- reacting to messages").
--
-- `chat_message_reactions`: one emoji per person per message, picked from a
-- small fixed set (rule 20: a choice is picked, not typed). Reacting again
-- with another emoji changes it; the same one again takes it away. A reaction
-- is not a message: it never moves a thread's last_message_at and never
-- raises a chat notice.
--
-- The row carries its message's thread and household, set by a trigger from
-- the message itself (never trusted from the caller), so every policy is the
-- set form `thread_id in (select wh.my_chat_threads())` — who reads a
-- message reads its reactions, and a helper, who is never in Family chat,
-- can neither read nor react there.
--
-- Writes go through public.chat_react (security invoker: the caller's own
-- RLS decides), which inserts, changes or removes the caller's own reaction.
--
-- Rollback: drop function public.chat_react(uuid, text);
-- drop table public.chat_message_reactions; drop function wh.chat_reaction_guard();

create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, member_id)
);

comment on table public.chat_message_reactions is
  'One emoji reaction per person per chat message, from a fixed set. Read by whoever reads the message; written only as yourself, through public.chat_react.';

-- The primary key leads with message_id, so it serves reads by message.
create index if not exists chat_message_reactions_household_idx on public.chat_message_reactions (household_id);
create index if not exists chat_message_reactions_thread_idx on public.chat_message_reactions (thread_id);
create index if not exists chat_message_reactions_member_idx on public.chat_message_reactions (member_id);

-- A reaction belongs to its message's thread and household, only to a
-- message that still stands, and only its emoji ever changes.
create or replace function wh.chat_reaction_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_message public.chat_messages;
begin
  if tg_op = 'UPDATE' and (new.message_id <> old.message_id or new.member_id <> old.member_id) then
    raise exception 'only a reaction''s emoji can change' using errcode = '42501';
  end if;
  select * into v_message from public.chat_messages where id = new.message_id;
  if v_message.id is null or v_message.removed_at is not null then
    raise exception 'that message cannot be reacted to' using errcode = '42501';
  end if;
  new.thread_id := v_message.thread_id;
  new.household_id := v_message.household_id;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger chat_message_reactions_guard
  before insert or update on public.chat_message_reactions
  for each row execute function wh.chat_reaction_guard();

alter table public.chat_message_reactions enable row level security;

drop policy if exists chat_message_reactions_read on public.chat_message_reactions;
create policy chat_message_reactions_read on public.chat_message_reactions for select
  to authenticated
  using (thread_id in (select wh.my_chat_threads()));

-- As yourself, on a message in a thread you are in. The guard has already
-- set thread_id and household_id from the message when this check runs.
drop policy if exists chat_message_reactions_insert_own on public.chat_message_reactions;
create policy chat_message_reactions_insert_own on public.chat_message_reactions for insert
  to authenticated
  with check (
    thread_id in (select wh.my_chat_threads())
    and (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
  );

drop policy if exists chat_message_reactions_update_own on public.chat_message_reactions;
create policy chat_message_reactions_update_own on public.chat_message_reactions for update
  to authenticated
  using (
    thread_id in (select wh.my_chat_threads())
    and (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
  )
  with check (
    thread_id in (select wh.my_chat_threads())
    and (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
  );

drop policy if exists chat_message_reactions_delete_own on public.chat_message_reactions;
create policy chat_message_reactions_delete_own on public.chat_message_reactions for delete
  to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

revoke all on public.chat_message_reactions from anon;
revoke all on public.chat_message_reactions from authenticated;
grant select, insert, delete on public.chat_message_reactions to authenticated;
grant update (emoji) on public.chat_message_reactions to authenticated;

-- Sets the caller's reaction to a message (null takes it away) and returns
-- what it now is. Security invoker: a message the caller cannot read is not
-- found, and every write is held to the policies above.
create or replace function public.chat_react(p_message uuid, p_emoji text)
  returns text
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_household uuid;
  v_thread uuid;
  v_me uuid;
begin
  select household_id, thread_id into v_household, v_thread from public.chat_messages where id = p_message and removed_at is null;
  if v_household is null then
    raise exception 'that message cannot be reacted to' using errcode = '42501';
  end if;
  select m.member_id into v_me from wh.my_memberships() m where m.household_id = v_household limit 1;
  if v_me is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  if p_emoji is null then
    delete from public.chat_message_reactions where message_id = p_message and member_id = v_me;
    return null;
  end if;
  insert into public.chat_message_reactions (message_id, thread_id, household_id, member_id, emoji)
  values (p_message, v_thread, v_household, v_me, p_emoji)
  on conflict (message_id, member_id) do update set emoji = excluded.emoji;
  return p_emoji;
end;
$$;

comment on function public.chat_react(uuid, text) is
  'Sets (or, with null, removes) the caller''s one reaction to a chat message. Security invoker: RLS decides.';

revoke all on function public.chat_react(uuid, text) from public;
grant execute on function public.chat_react(uuid, text) to authenticated;
