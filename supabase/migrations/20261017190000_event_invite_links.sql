-- Inviting people to a family event, with a link.
--
-- A household plans a birthday or a get-together and wants to ask people who
-- are not in WonderHome. An event's invite link carries a long random token
-- (32 random bytes). Whoever holds the link sees the event's title, when and
-- where, and the household's name, and can reply yes, no or maybe with their
-- name. Nothing else about the household is reachable from it.
--
-- Unlike a household invitation, which grants membership and so is kept only
-- as a hash, this token is kept as it is: the household shares it with
-- whoever it likes and needs to copy it again later, and all it can ever do
-- is see one event and leave a reply. Members read it; it is revoked by
-- setting `revoked_at`, and a new link is a new token.
--
-- `event_invite_links`: members of the household read and create links for
-- their own events and revoke them. `event_guests`: the replies. Members read
-- and remove them; a reply is only ever written by the server after it has
-- matched a live link (service role), never by a session, so neither table
-- has an anonymous policy at all.

create table public.event_invite_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{40,64}$'),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.event_invite_links is
  'Shareable invite links for a family event. The token only ever shows one event and takes replies; revoked by revoked_at.';

create index event_invite_links_event on public.event_invite_links (event_id);

alter table public.event_invite_links enable row level security;

create policy event_invite_links_select_member on public.event_invite_links for select
  to authenticated using (wh.is_member(household_id));

create policy event_invite_links_insert_member on public.event_invite_links for insert
  to authenticated
  with check (
    wh.is_member(household_id)
    and (created_by_member_id is null or created_by_member_id = wh.member_id(household_id))
    and exists (select 1 from public.family_events e where e.id = event_id and e.household_id = event_invite_links.household_id)
  );

create policy event_invite_links_update_member on public.event_invite_links for update
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create table public.event_guests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  link_id uuid references public.event_invite_links(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 80),
  response text not null check (response in ('yes', 'no', 'maybe')),
  party_size integer not null default 1 check (party_size between 1 and 20),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_guests is
  'Replies to an event from people outside the household, through its invite link. Written only by the server.';

create index event_guests_event on public.event_guests (event_id);

create trigger event_guests_set_updated_at
  before update on public.event_guests
  for each row execute function wh.set_updated_at();

alter table public.event_guests enable row level security;

create policy event_guests_select_member on public.event_guests for select
  to authenticated using (wh.is_member(household_id));

create policy event_guests_delete_member on public.event_guests for delete
  to authenticated using (wh.is_member(household_id));

-- Whoever plans an event asks people to it: the event's owner (or anyone,
-- for an event nobody owns, as with editing it) may add and remove the
-- household members it asks. A member still answers only for themselves
-- (`event_participants_write_own`), and an Admin for anyone.
create policy event_participants_write_event_owner on public.event_participants for all
  to authenticated
  using (
    wh.is_member(household_id)
    and exists (
      select 1 from public.family_events e
      where e.id = event_id and e.household_id = event_participants.household_id
        and (e.owner_member_id is null or e.owner_member_id = wh.member_id(e.household_id))
    )
  )
  with check (
    wh.is_member(household_id)
    and exists (
      select 1 from public.family_events e
      where e.id = event_id and e.household_id = event_participants.household_id
        and (e.owner_member_id is null or e.owner_member_id = wh.member_id(e.household_id))
    )
  );

notify pgrst, 'reload schema';
