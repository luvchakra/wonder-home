-- Two small additions a household asked for by name.
--
-- 1. A recorded transaction carries its own payee, kind and owner.
--
--    Until now a row in `obligation_history` borrowed all three from its
--    bill. That is still the default — the form prefills them from the bill —
--    but a household can now say that this month's electricity was paid to a
--    different collection agent, or that this term's fee was one parent's to
--    settle. Every column is nullable: an older row, or one recorded by the
--    email connector, keeps falling back to its bill's own values, so nothing
--    already recorded changes meaning.
--
--    `kind` is open text, not the bill's fixed enum: the form offers the
--    bill kinds and whatever this household has used before, and always lets
--    a new one be added (CLAUDE.md rule 20), so a fixed check here would
--    refuse the true answer. `owner_member_id` is held to the same household
--    by a trigger, the same shape as `wh.assert_outcome_owner_in_household`.
--    Write access is unchanged: `obligation_history_write_admin` already
--    covers every column on the row.
--
-- 2. A household member can have a gender and free notes.
--
--    Asked for on "Add a helper", and stored on `household_members` beside
--    nickname/occupation (20260921070000) so the same profile editor that
--    changes those can change these (rule 12). `gender` is open text for the
--    same reason `relationship` is: the form offers a short list and
--    "add another", and a fixed check would refuse a true answer. Both are
--    optional and readable by the household exactly as every other profile
--    field already is; no RLS change is needed, and the self-update guard
--    (`wh.guard_member_self_update`) only protects household/type/status/
--    account link, so a member may edit their own.

alter table public.obligation_history
  add column payee text check (payee is null or length(trim(payee)) between 1 and 160),
  add column kind text check (kind is null or length(trim(kind)) between 1 and 60),
  add column owner_member_id uuid references public.household_members(id) on delete set null;

comment on column public.obligation_history.payee is
  'Who this payment went to, when it differs from (or was recorded separately from) the bill''s own payee. Null falls back to the bill.';
comment on column public.obligation_history.kind is
  'What kind of payment this was, in the household''s words. Null falls back to the bill''s kind.';
comment on column public.obligation_history.owner_member_id is
  'Whose payment this was to make. Null falls back to the bill''s responsible member.';

create index obligation_history_owner_idx
  on public.obligation_history (owner_member_id)
  where owner_member_id is not null;

create or replace function wh.assert_transaction_owner_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if new.owner_member_id is null then
    return new;
  end if;

  select household_id into v_household from public.household_members where id = new.owner_member_id;
  if v_household is distinct from new.household_id then
    raise exception 'Owner % is not part of household %', new.owner_member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger obligation_history_owner_in_household
  before insert or update of owner_member_id, household_id on public.obligation_history
  for each row execute function wh.assert_transaction_owner_in_household();

alter table public.household_members
  add column gender text check (gender is null or length(trim(gender)) between 1 and 40),
  add column notes text check (notes is null or length(trim(notes)) between 1 and 500);

comment on column public.household_members.gender is
  'How this person describes their gender, if the household records it. Open text; never required.';
comment on column public.household_members.notes is
  'Anything the household wants to remember about this person — languages, preferences, how to reach them.';

notify pgrst, 'reload schema';
