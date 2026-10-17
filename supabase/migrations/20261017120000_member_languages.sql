-- The languages each member speaks, and how well.
--
-- Separate from `household_members.language`, which is the one language a
-- person reads WonderHome in. This is everything they speak: a grandmother
-- who reads the app in Hindi may also understand Marathi and some English,
-- and a helper may speak Kannada and Hindi. HomeTalk uses it to know who can
-- be spoken to in what; nothing here changes the app's own language.
--
-- `language` is an ISO 639 code from the picker ("hi", "kn") or, for a
-- language not listed, the household's own words for it ("Konkani").
-- `fluency` is one of four plain levels, shown as a small meter.
--
-- Every member reads the household's list (it is about talking to each
-- other). A member changes their own; an Admin changes anyone's.

create table public.member_languages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  language text not null check (length(trim(language)) between 1 and 40),
  fluency text not null check (fluency in ('basic', 'conversational', 'fluent', 'native')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, language)
);

comment on table public.member_languages is
  'The languages each member speaks and how well (basic, conversational, fluent, native). Not the app language, which is household_members.language.';

create index member_languages_household on public.member_languages (household_id);

create trigger member_languages_set_updated_at
  before update on public.member_languages
  for each row execute function wh.set_updated_at();

alter table public.member_languages enable row level security;

create policy member_languages_select_member on public.member_languages for select
  to authenticated using (wh.is_member(household_id));

-- The member must belong to the household the row names, and the writer is
-- that member or an Admin of it.
create policy member_languages_insert_self_or_admin on public.member_languages for insert
  to authenticated
  with check (
    (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id))
    and exists (select 1 from public.household_members m where m.id = member_id and m.household_id = member_languages.household_id)
  );

create policy member_languages_update_self_or_admin on public.member_languages for update
  to authenticated
  using (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id))
  with check (
    (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id))
    and exists (select 1 from public.household_members m where m.id = member_id and m.household_id = member_languages.household_id)
  );

create policy member_languages_delete_self_or_admin on public.member_languages for delete
  to authenticated using (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id));

notify pgrst, 'reload schema';
