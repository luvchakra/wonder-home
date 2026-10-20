-- A child's companion (story 08-018): a cat on the child's Home that tells
-- them what is new and what is next, and that they name themselves.
--
-- One row per child: what kind of companion and the name they gave it. The
-- child writes their own; their guardians and the household's Admins read
-- it (a parent can see what the cat is called), and nobody else does. The
-- messages are not stored: they are worked out on each visit from the
-- child's own notifications, goals and school work (`school/companion.ts`).

create table public.child_companions (
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  kind text not null default 'cat' check (kind in ('cat')),
  name text check (name is null or length(trim(name)) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, member_id)
);

comment on table public.child_companions is
  'A child''s companion on their Home (08-018): its kind and the name the child gave it. Written by the child; read by the child, their guardians and Admins.';

create index child_companions_member_idx on public.child_companions (member_id);

create trigger child_companions_set_updated_at
  before update on public.child_companions
  for each row execute function wh.set_updated_at();

alter table public.child_companions enable row level security;

-- The child themself, the household's Admins, and the child's guardians. Set forms, once per statement.
create policy child_companions_select on public.child_companions for select
  to authenticated
  using (
    (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or household_id in (select wh.admin_households())
    or (household_id, member_id) in (
      select g.household_id, g.child_member_id
      from public.member_guardians g
      where (g.household_id, g.guardian_member_id) in (select household_id, member_id from wh.my_memberships())
    )
  );

-- Only the child names their own companion, and only a child has one.
create policy child_companions_insert_own on public.child_companions for insert
  to authenticated
  with check (
    (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    and member_id in (select m.id from public.household_members m where m.member_type = 'child')
  );

create policy child_companions_update_own on public.child_companions for update
  to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()))
  with check ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

revoke all on public.child_companions from anon;
grant select, insert, update on public.child_companions to authenticated;

notify pgrst, 'reload schema';
