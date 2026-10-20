-- A diet for the whole family and for each person (the owner, 2026-10-20:
-- "add way under preferences to veg, non veg, vegan, etc for preferences for
-- whole family as well as on member level").
--
-- A diet is one more kind of food preference, so it is read wherever the
-- others are (the Meals screen, the meal check, HomeBrain's context) and is
-- written under the same policies: the whole household or the caller's own
-- member, and an Admin for anybody. Its subject is one of a closed set (rule
-- 20 — picked, not typed), and each scope holds at most one diet: the whole
-- household one, and each member one.

alter table public.food_preferences drop constraint food_preferences_kind_check;
alter table public.food_preferences
  add constraint food_preferences_kind_check
    check (kind in ('allergy', 'medical', 'ethical', 'dislike', 'preference', 'diet'));

alter table public.food_preferences
  add constraint food_preferences_diet_subject_check
    check (kind <> 'diet' or subject in ('vegetarian', 'eggetarian', 'non_vegetarian', 'vegan', 'jain'));

create unique index food_preferences_one_diet_idx
  on public.food_preferences (household_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind = 'diet';

comment on constraint food_preferences_diet_subject_check on public.food_preferences is
  'A diet (kind = diet) is one of vegetarian, eggetarian, non_vegetarian, vegan or jain; one per household and one per member.';

notify pgrst, 'reload schema';
