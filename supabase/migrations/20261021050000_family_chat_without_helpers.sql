-- Family chat is the family's: a househelper is never in it (the owner,
-- 2026-10-21: "for family chat, never include househelper").
--
-- The household thread used to hold every active member. Everything a chat
-- reads or writes is decided by wh.my_chat_threads() (every policy on
-- chat_threads, chat_participants and chat_messages reads it), so its
-- household branch now leaves helpers out, and chat_household_thread refuses
-- a helper outright. A helper's own direct and group chats are unchanged.
--
-- Rollback: re-create wh.my_chat_threads() and public.chat_household_thread()
-- from 20261021030000_household_chat.sql.

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
  where m.profile_id = (select auth.uid()) and m.status = 'active' and m.member_type <> 'helper' and t.kind = 'household'
  union
  select p.thread_id
  from public.chat_participants p
  join public.household_members m on m.id = p.member_id
  where m.profile_id = (select auth.uid()) and m.status = 'active' and p.left_at is null;
$$;

comment on function wh.my_chat_threads() is
  'The chat threads the caller is in: the family chat (never for a helper) and their direct and group chats. Set form, for policies: evaluated once per statement.';

revoke all on function wh.my_chat_threads() from public;
grant execute on function wh.my_chat_threads() to authenticated;

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
  if exists (select 1 from public.household_members where id = v_me and member_type = 'helper') then
    raise exception 'the family chat is for the family' using errcode = '42501';
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

revoke all on function public.chat_household_thread(uuid) from public;
grant execute on function public.chat_household_thread(uuid) to authenticated;
