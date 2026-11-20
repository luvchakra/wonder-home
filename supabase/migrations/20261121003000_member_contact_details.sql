-- A member's contact details (owner, 2026-11-20: "add email, phone as
-- attributes in profile").
--
-- How the family reaches a person: an email and a phone number on their
-- profile, edited in the same details sheet as the rest of it ("Save details").
--
-- These are NOT the sign-in identity. They are kept apart from
-- household_member_emails (the sign-in email, wh.claim_members_by_email) and
-- household_member_phones (the number a verified phone sign-in links,
-- wh.claim_members_by_phone) on purpose: nothing reads this table to sign
-- anyone in, link an account, verify or link a WhatsApp number, trust a
-- HomeSend sender, or decide who a message is from. Entering a number here
-- grants nothing. Nothing here is given to a model (knowledge registry:
-- excluded).
--
-- The phone is kept in E.164 (+919876543210) with the words the person typed
-- beside it (phone_as_typed), so what they wrote is never lost.
--
-- Who reads it: an Admin, the member themselves, the household's adults for
-- any adult or helper, and a child's guardians for that child. A child reads
-- only their own. Who writes it: the member themselves and any Admin (the same
-- rule as the rest of the details sheet, identity/households.ts
-- updateMemberProfile). Policies use the set forms only.
--
-- Additive and safe in either order: until this runs, the app reads nothing,
-- hides the two fields and saves the rest of the sheet as before.

create table if not exists public.household_member_contacts (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  phone_as_typed text check (phone_as_typed is null or char_length(phone_as_typed) <= 40),
  updated_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_member_contacts_something check (email is not null or phone is not null)
);

comment on table public.household_member_contacts is
  'A member''s contact email and phone (how the family reaches them). Never a sign-in identity, never a verification, never sender trust; never given to a model. Admins, the member, adults (for adults and helpers) and a child''s guardians read it; the member and Admins write it.';

-- Foreign keys are indexed (the performance rule); the household one is what every read filters on.
create index if not exists household_member_contacts_household_id_idx on public.household_member_contacts (household_id);
create index if not exists household_member_contacts_updated_by_member_id_idx on public.household_member_contacts (updated_by_member_id);

drop trigger if exists household_member_contacts_set_updated_at on public.household_member_contacts;
create trigger household_member_contacts_set_updated_at
  before update on public.household_member_contacts
  for each row execute function wh.set_updated_at();

alter table public.household_member_contacts enable row level security;

drop policy if exists household_member_contacts_select on public.household_member_contacts;
create policy household_member_contacts_select on public.household_member_contacts for select
  to authenticated using (
    household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or (
      household_id in (select household_id from wh.adult_households())
      and member_id in (select m.id from public.household_members m where m.member_type <> 'child')
    )
    or (household_id, member_id) in (
      select g.household_id, g.child_member_id
      from public.member_guardians g
      where (g.household_id, g.guardian_member_id) in (select household_id, member_id from wh.my_memberships())
    )
  );

drop policy if exists household_member_contacts_insert on public.household_member_contacts;
create policy household_member_contacts_insert on public.household_member_contacts for insert
  to authenticated
  with check (
    (household_id, member_id) in (select m.household_id, m.id from public.household_members m)
    and (
      household_id in (select wh.admin_households())
      or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    )
  );

drop policy if exists household_member_contacts_update on public.household_member_contacts;
create policy household_member_contacts_update on public.household_member_contacts for update
  to authenticated
  using (
    household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
  )
  with check (
    (household_id, member_id) in (select m.household_id, m.id from public.household_members m)
    and (
      household_id in (select wh.admin_households())
      or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    )
  );

drop policy if exists household_member_contacts_delete on public.household_member_contacts;
create policy household_member_contacts_delete on public.household_member_contacts for delete
  to authenticated using (
    household_id in (select wh.admin_households())
    or (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
  );

revoke all on public.household_member_contacts from anon;
grant select, insert, update, delete on public.household_member_contacts to authenticated;
