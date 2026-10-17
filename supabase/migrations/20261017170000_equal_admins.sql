-- Every Admin is equal.
--
-- Until now only the household's owner (role 'head') could make or remove an
-- Administrator. The household asked that no two Admins differ in what they
-- may do: any Admin may now make another adult an Admin, or step one back to
-- adult. Two lines stay fixed:
--   * 'head' itself, ownership, is never granted or revoked here (that is a
--     separate transfer), so the owner always stays an Admin and a household
--     can never be left with none;
--   * only an adult member can become an Administrator, never a child or a
--     househelper.

drop policy household_roles_insert_admin on public.household_roles;
drop policy household_roles_delete_admin on public.household_roles;

create policy household_roles_insert_admin
  on public.household_roles for insert
  to authenticated
  with check (
    case
      when role = 'head' then false
      when role = 'administrator' then
        wh.is_household_admin(household_id)
        and exists (
          select 1 from public.household_members m
          where m.id = member_id and m.household_id = household_roles.household_id and m.member_type = 'adult'
        )
      else wh.is_household_admin(household_id)
    end
  );

create policy household_roles_delete_admin
  on public.household_roles for delete
  to authenticated
  using (
    case
      when role = 'head' then false
      else wh.is_household_admin(household_id)
    end
  );

comment on table public.household_roles is
  'Role grants. Exactly one head (the owner) per household; any Admin designates or removes Administrators, who must be adults.';

notify pgrst, 'reload schema';
