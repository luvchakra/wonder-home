-- The facts behind the setup percentage in one round trip
-- (performance pass, 2026-10-19).
--
-- Home, Manage Household and the setup page each asked sixteen head-only
-- counts and one guardian read: seventeen requests in parallel for every
-- Home view, which on a small instance queue behind each other (the live
-- project averaged 21 ms for a single ten-row count under that load). This is
-- the same seventeen numbers from one statement.
--
-- SECURITY INVOKER, so every count is still taken through the caller's own
-- row-level security: a member counts exactly what they could count before,
-- never a row they could not read.

create or replace function public.household_setup_counts(p_household_id uuid)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select jsonb_build_object(
    'members', (select count(*) from public.household_members m
                where m.household_id = p_household_id and m.status = 'active'),
    'children', (select count(*) from public.household_members m
                 where m.household_id = p_household_id and m.status = 'active' and m.member_type = 'child'),
    'childrenWithBirthdays', (select count(*) from public.household_members m
                              where m.household_id = p_household_id and m.status = 'active'
                                and m.member_type = 'child' and m.date_of_birth is not null),
    'childrenWithGuardians', (select count(distinct g.child_member_id) from public.member_guardians g
                              where g.household_id = p_household_id),
    'helpers', (select count(*) from public.household_members m
                where m.household_id = p_household_id and m.status = 'active' and m.member_type = 'helper'),
    'helperAvailabilityWindows', (select count(*) from public.member_availability a
                                  where a.household_id = p_household_id),
    'responsibilities', (select count(*) from public.responsibilities r
                         where r.household_id = p_household_id),
    'playbookItems', (select count(*) from public.playbook_items p
                      where p.household_id = p_household_id and p.active),
    'policies', (select count(*) from public.policies p
                 where p.household_id = p_household_id and p.active),
    'homeAssets', (select count(*) from public.home_assets a
                   where a.household_id = p_household_id and a.status = 'active'),
    'pets', (select count(*) from public.pets p where p.household_id = p_household_id),
    'obligations', (select count(*) from public.obligations o
                    where o.household_id = p_household_id and o.status <> 'cancelled'),
    'foodPreferences', (select count(*) from public.food_preferences f
                        where f.household_id = p_household_id),
    'recipes', (select count(*) from public.recipes r where r.household_id = p_household_id),
    'schoolEnrolments', (select count(*) from public.school_enrolments s
                         where s.household_id = p_household_id and s.active),
    'familyEvents', (select count(*) from public.family_events e
                     where e.household_id = p_household_id and e.status <> 'cancelled')
  );
$$;

comment on function public.household_setup_counts(uuid) is
  'The setup percentage''s counts in one call, each through the caller''s own RLS (security invoker).';

revoke execute on function public.household_setup_counts(uuid) from public, anon;
grant execute on function public.household_setup_counts(uuid) to authenticated;

notify pgrst, 'reload schema';
