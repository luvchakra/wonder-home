-- HomeBrain knows (Nothing stuck in review, phase 3; the owner 2026-11-14:
-- "minimum intervention is required to input information in the app").
--
-- 1. Household rules learned from every answer, pick and correction
--    (`homebrain/memory/rules.ts`). `homesend_learned_defaults` held one
--    kind, which child an outside sender's items are for. It now holds:
--      sender_child     sender → a child (unchanged)
--      sender_person    sender → any member of the household
--      sender_area      sender → what its items are (a HomeSend kind)
--      vendor_category  a payee or shop → its category
--      phrase_item      words a person uses → the grocery item ("atta" → "Atta (wheat flour)")
--      place_alias      words a person uses → a saved place
--    The first two name a member (`value_member_id`); the rest a word
--    (`value_text`). A rule never crosses households (a member is checked to
--    be of the same household on write) and never carries money, approval or
--    permission: `value_text` is a short label, never an amount (the app
--    refuses digits-and-currency values; the table refuses currency signs).
--    A key taught two different values becomes `mixed` and settles nothing.
--    `source` says how it was taught and `times` how often it was confirmed.
--
-- 2. `homesend_changes` records what HomeBrain needs to set each kind's bar
--    from the household's own accuracy (`homebrain/memory/kind-bar.ts`):
--      corrected_at / corrected_field / corrected_by_member_id
--                      a person corrected the entry in place (B's plain
--                      corrections call `learnFromCorrection`);
--      confirmed_basis why an entry is confirmed: a person, an answer, the
--                      bar, or overnight evidence (a second matching source,
--                      a consistent recurring pattern).
--
-- 3. `homebrain_kind_bars`: each kind's bar for a household, worked out
--    nightly from 90 days of undo and correction (limits 80–99%, 95% with
--    too little history). Read by every member, written only by the
--    service role (the HomeBrain sleep job). An Admin's chosen bar
--    (`policies`, ai_autonomy) still overrides it.
--
-- Safe in either order: old code reads `homesend_learned_defaults` with its
-- own column list and drops kinds it doesn't know; every new column has a
-- default or is nullable; the new table is read as "no bar learned" while
-- missing. Rollback: drop the new table and columns, put the old kind check
-- and not-null back after deleting non-sender_child rows.

-- 1. Rules ---------------------------------------------------------------------

alter table public.homesend_learned_defaults
  add column if not exists value_text text,
  add column if not exists source text not null default 'answer',
  add column if not exists times integer not null default 1;

alter table public.homesend_learned_defaults alter column value_member_id drop not null;

alter table public.homesend_learned_defaults drop constraint if exists homesend_learned_defaults_kind_check;
alter table public.homesend_learned_defaults add constraint homesend_learned_defaults_kind_check
  check (kind in ('sender_child', 'sender_person', 'sender_area', 'vendor_category', 'phrase_item', 'place_alias'));

alter table public.homesend_learned_defaults drop constraint if exists homesend_learned_defaults_value_shape;
alter table public.homesend_learned_defaults add constraint homesend_learned_defaults_value_shape
  check (
    case when kind in ('sender_child', 'sender_person')
      then value_member_id is not null and value_text is null
      else value_member_id is null and value_text is not null
    end
  );

alter table public.homesend_learned_defaults drop constraint if exists homesend_learned_defaults_value_text_check;
alter table public.homesend_learned_defaults add constraint homesend_learned_defaults_value_text_check
  check (value_text is null or (length(value_text) between 1 and 120 and value_text !~ '[₹$€£¥]'));

alter table public.homesend_learned_defaults drop constraint if exists homesend_learned_defaults_source_check;
alter table public.homesend_learned_defaults add constraint homesend_learned_defaults_source_check
  check (source in ('answer', 'pick', 'correction'));

alter table public.homesend_learned_defaults drop constraint if exists homesend_learned_defaults_times_check;
alter table public.homesend_learned_defaults add constraint homesend_learned_defaults_times_check
  check (times between 1 and 100000);

comment on table public.homesend_learned_defaults is
  'Household rules HomeBrain learned from an answer, pick or correction (sender → person, sender → kind, vendor → category, phrase → grocery item, place alias), so nobody is asked twice. Never money, approval or permission. Admins see and forget them on Settings → AI Assistant.';

-- A member value only from the same household; a word value names nobody.
drop policy if exists homesend_learned_defaults_insert_self on public.homesend_learned_defaults;
create policy homesend_learned_defaults_insert_self on public.homesend_learned_defaults for insert
  to authenticated
  with check (
    (household_id, learned_by_member_id) in (select household_id, member_id from wh.my_memberships())
    and (
      value_member_id is null
      or (household_id, value_member_id) in (select m.household_id, m.id from public.household_members m where m.household_id in (select wh.member_households()))
    )
  );

drop policy if exists homesend_learned_defaults_update_self on public.homesend_learned_defaults;
create policy homesend_learned_defaults_update_self on public.homesend_learned_defaults for update
  to authenticated
  using (household_id in (select wh.member_households()))
  with check (
    (household_id, learned_by_member_id) in (select household_id, member_id from wh.my_memberships())
    and (
      value_member_id is null
      or (household_id, value_member_id) in (select m.household_id, m.id from public.household_members m where m.household_id in (select wh.member_households()))
    )
  );

-- 2. What each entry's accuracy was -------------------------------------------

alter table public.homesend_changes
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_field text,
  add column if not exists corrected_by_member_id uuid references public.household_members(id) on delete set null,
  add column if not exists confirmed_basis text;

alter table public.homesend_changes drop constraint if exists homesend_changes_corrected_field_check;
alter table public.homesend_changes add constraint homesend_changes_corrected_field_check
  check (corrected_field is null or corrected_field in ('person', 'date', 'area', 'category', 'item', 'place', 'amount', 'title'));

alter table public.homesend_changes drop constraint if exists homesend_changes_corrected_consistent;
alter table public.homesend_changes add constraint homesend_changes_corrected_consistent
  check ((corrected_at is null) = (corrected_field is null));

alter table public.homesend_changes drop constraint if exists homesend_changes_confirmed_basis_check;
alter table public.homesend_changes add constraint homesend_changes_confirmed_basis_check
  check (confirmed_basis is null or confirmed_basis in ('person', 'answer', 'bar', 'second_source', 'recurring'));

comment on column public.homesend_changes.corrected_at is 'A person corrected this entry in place (HomeTalk or WhatsApp); feeds the kind''s confidence bar.';
comment on column public.homesend_changes.confirmed_basis is 'Why it is confirmed: a person, an answer, the bar, or overnight evidence (second_source, recurring).';

create index if not exists homesend_changes_corrected_by_idx
  on public.homesend_changes (corrected_by_member_id)
  where corrected_by_member_id is not null;

-- 3. Each kind's bar -----------------------------------------------------------

create table if not exists public.homebrain_kind_bars (
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('bill', 'school_item', 'activity_item', 'event', 'grocery_item', 'health_document', 'receipt')),
  percent integer not null check (percent between 80 and 99),
  added integer not null default 0 check (added >= 0),
  undone integer not null default 0 check (undone >= 0),
  corrected integer not null default 0 check (corrected >= 0),
  computed_at timestamptz not null default now(),
  primary key (household_id, kind)
);

comment on table public.homebrain_kind_bars is
  'How sure HomeSend must be to add each kind on its own, from the household''s own undo and correction rate (80–99%). Written nightly by HomeBrain; an Admin''s chosen bar overrides it.';

alter table public.homebrain_kind_bars enable row level security;

drop policy if exists homebrain_kind_bars_select_member on public.homebrain_kind_bars;
create policy homebrain_kind_bars_select_member on public.homebrain_kind_bars for select
  to authenticated
  using (household_id in (select wh.member_households()));

-- No insert, update or delete policy: only the service role writes it.
grant select on public.homebrain_kind_bars to authenticated;

notify pgrst, 'reload schema';
