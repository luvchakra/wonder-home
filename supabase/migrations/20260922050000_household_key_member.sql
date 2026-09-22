-- A household's Key Member: the person every other member's `relationship`
-- text is described relative to ("Father", "Mother", "Younger brother" all
-- answer the question "who is this, to the key member?"). Deliberately not
-- the same concept as `owner_member_id` (that is who administers the
-- household; this is who the family's story is told from) and deliberately
-- not an automatic kinship engine: `household_members.relationship` stays
-- free text (20260921070000's own reasoning — a fixed list refuses a true
-- answer like "stepfather"), so changing the key member does not and cannot
-- rewrite anyone's relationship for them; a household re-describes them by
-- hand, same as it typed them in the first place.

alter table public.households
  add column key_member_id uuid references public.household_members(id) on delete set null;

comment on column public.households.key_member_id is
  'The member every other relationship is described relative to. Null until a household sets one — relationship text keeps working either way, it just has no named anchor yet.';

-- Same shape as households_owner_consistency: a key member has to belong to
-- the household naming them, or the reference means nothing.
create or replace function wh.assert_key_member_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_member_household uuid;
begin
  if new.key_member_id is null then
    return new;
  end if;

  select m.household_id into v_key_member_household
  from public.household_members m
  where m.id = new.key_member_id;

  if v_key_member_household is distinct from new.id then
    raise exception 'Key member % belongs to a different household', new.key_member_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger households_key_member_consistency
  before insert or update of key_member_id on public.households
  for each row execute function wh.assert_key_member_in_household();

-- No RLS change: households_update_admin (for update, to authenticated,
-- using/with check wh.is_household_admin(id)) already covers every column
-- on this table, this one included.
