-- Connections: let any adult member create and change them (owner, 2026-10-28),
-- not only admins. Children are excluded (connections hold passwords); every
-- member still sees and picks them.
--
-- A set-form helper for "the households I am an active adult member of", matching
-- wh.admin_households() / wh.member_households() so policies evaluate it once per
-- statement, never per row.
create or replace function wh.adult_households()
  returns table (household_id uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.profile_id = auth.uid()
    and m.status = 'active'
    and m.member_type = 'adult';
$$;

comment on function wh.adult_households() is
  'The households the caller is an active adult member of. Set form for policies: evaluated once per statement.';

grant execute on function wh.adult_households() to authenticated;

-- Swap the admin write policies for adult ones. SELECT stays as it was
-- (connections: every member; connection_secrets: only the writer, and never the
-- secret column).
drop policy connections_write_admin on public.connections;
create policy connections_write_adult on public.connections for all
  to authenticated
  using (household_id in (select wh.adult_households()))
  with check (household_id in (select wh.adult_households()));

drop policy connection_secrets_write_admin on public.connection_secrets;
create policy connection_secrets_write_adult on public.connection_secrets for all
  to authenticated
  using (household_id in (select wh.adult_households()))
  with check (household_id in (select wh.adult_households()));

notify pgrst, 'reload schema';
