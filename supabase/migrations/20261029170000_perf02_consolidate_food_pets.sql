-- PERF-02: consolidate overlapping permissive RLS policies (food-pets).
-- One permissive policy per {table, authenticated, command}; USING/WITH CHECK
-- are the exact OR of the originals, so the row set each role may read/write
-- is unchanged. Restrictive and non-authenticated policies are left intact.
-- Equivalence is proven by scripts/test-policy-consolidation-rls.mjs.

-- consumables: 2 permissive policy(ies) -> one per command.
drop policy if exists consumables_write_member on public.consumables;
drop policy if exists consumables_select_member on public.consumables;
create policy consumables_select on public.consumables
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy consumables_insert on public.consumables
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy consumables_update on public.consumables
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy consumables_delete on public.consumables
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists consumables_select on public.consumables;
--   drop policy if exists consumables_insert on public.consumables;
--   drop policy if exists consumables_update on public.consumables;
--   drop policy if exists consumables_delete on public.consumables;
--   create policy consumables_write_member on public.consumables for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy consumables_select_member on public.consumables for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- consumable_purchases: 2 permissive policy(ies) -> one per command.
drop policy if exists consumable_purchases_write_member on public.consumable_purchases;
drop policy if exists consumable_purchases_select_member on public.consumable_purchases;
create policy consumable_purchases_select on public.consumable_purchases
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy consumable_purchases_insert on public.consumable_purchases
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy consumable_purchases_update on public.consumable_purchases
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy consumable_purchases_delete on public.consumable_purchases
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists consumable_purchases_select on public.consumable_purchases;
--   drop policy if exists consumable_purchases_insert on public.consumable_purchases;
--   drop policy if exists consumable_purchases_update on public.consumable_purchases;
--   drop policy if exists consumable_purchases_delete on public.consumable_purchases;
--   create policy consumable_purchases_write_member on public.consumable_purchases for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy consumable_purchases_select_member on public.consumable_purchases for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- cart_suggestions: 2 permissive policy(ies) -> one per command.
drop policy if exists cart_suggestions_write_member on public.cart_suggestions;
drop policy if exists cart_suggestions_select_member on public.cart_suggestions;
create policy cart_suggestions_select on public.cart_suggestions
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy cart_suggestions_insert on public.cart_suggestions
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy cart_suggestions_update on public.cart_suggestions
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy cart_suggestions_delete on public.cart_suggestions
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists cart_suggestions_select on public.cart_suggestions;
--   drop policy if exists cart_suggestions_insert on public.cart_suggestions;
--   drop policy if exists cart_suggestions_update on public.cart_suggestions;
--   drop policy if exists cart_suggestions_delete on public.cart_suggestions;
--   create policy cart_suggestions_write_member on public.cart_suggestions for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy cart_suggestions_select_member on public.cart_suggestions for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- food_preferences: 2 permissive policy(ies) -> one per command.
drop policy if exists food_preferences_write_own on public.food_preferences;
drop policy if exists food_preferences_select_member on public.food_preferences;
create policy food_preferences_select on public.food_preferences
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((member_id IS NULL) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy food_preferences_insert on public.food_preferences
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((member_id IS NULL) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
  );
create policy food_preferences_update on public.food_preferences
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((member_id IS NULL) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((member_id IS NULL) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
  );
create policy food_preferences_delete on public.food_preferences
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((member_id IS NULL) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
  );
-- ROLLBACK:
--   drop policy if exists food_preferences_select on public.food_preferences;
--   drop policy if exists food_preferences_insert on public.food_preferences;
--   drop policy if exists food_preferences_update on public.food_preferences;
--   drop policy if exists food_preferences_delete on public.food_preferences;
--   create policy food_preferences_write_own on public.food_preferences for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((member_id IS NULL) OR ((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((member_id IS NULL) OR ((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))));
--   create policy food_preferences_select_member on public.food_preferences for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- laundry_needs: 2 permissive policy(ies) -> one per command.
drop policy if exists laundry_needs_write_member on public.laundry_needs;
drop policy if exists laundry_needs_select_member on public.laundry_needs;
create policy laundry_needs_select on public.laundry_needs
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy laundry_needs_insert on public.laundry_needs
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy laundry_needs_update on public.laundry_needs
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy laundry_needs_delete on public.laundry_needs
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists laundry_needs_select on public.laundry_needs;
--   drop policy if exists laundry_needs_insert on public.laundry_needs;
--   drop policy if exists laundry_needs_update on public.laundry_needs;
--   drop policy if exists laundry_needs_delete on public.laundry_needs;
--   create policy laundry_needs_write_member on public.laundry_needs for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy laundry_needs_select_member on public.laundry_needs for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- meals: 2 permissive policy(ies) -> one per command.
drop policy if exists meals_write_member on public.meals;
drop policy if exists meals_select_member on public.meals;
create policy meals_select on public.meals
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meals_insert on public.meals
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meals_update on public.meals
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meals_delete on public.meals
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists meals_select on public.meals;
--   drop policy if exists meals_insert on public.meals;
--   drop policy if exists meals_update on public.meals;
--   drop policy if exists meals_delete on public.meals;
--   create policy meals_write_member on public.meals for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy meals_select_member on public.meals for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- meal_ingredient_needs: 2 permissive policy(ies) -> one per command.
drop policy if exists meal_ingredient_needs_write_member on public.meal_ingredient_needs;
drop policy if exists meal_ingredient_needs_select_member on public.meal_ingredient_needs;
create policy meal_ingredient_needs_select on public.meal_ingredient_needs
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meal_ingredient_needs_insert on public.meal_ingredient_needs
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meal_ingredient_needs_update on public.meal_ingredient_needs
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meal_ingredient_needs_delete on public.meal_ingredient_needs
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists meal_ingredient_needs_select on public.meal_ingredient_needs;
--   drop policy if exists meal_ingredient_needs_insert on public.meal_ingredient_needs;
--   drop policy if exists meal_ingredient_needs_update on public.meal_ingredient_needs;
--   drop policy if exists meal_ingredient_needs_delete on public.meal_ingredient_needs;
--   create policy meal_ingredient_needs_write_member on public.meal_ingredient_needs for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy meal_ingredient_needs_select_member on public.meal_ingredient_needs for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- meal_week_plans: 2 permissive policy(ies) -> one per command.
drop policy if exists meal_week_plans_write_adult on public.meal_week_plans;
drop policy if exists meal_week_plans_read on public.meal_week_plans;
create policy meal_week_plans_select on public.meal_week_plans
  for select to authenticated
  using (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meal_week_plans_insert on public.meal_week_plans
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  );
create policy meal_week_plans_update on public.meal_week_plans
  for update to authenticated
  using (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  )
  with check (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  );
create policy meal_week_plans_delete on public.meal_week_plans
  for delete to authenticated
  using (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  );
-- ROLLBACK:
--   drop policy if exists meal_week_plans_select on public.meal_week_plans;
--   drop policy if exists meal_week_plans_insert on public.meal_week_plans;
--   drop policy if exists meal_week_plans_update on public.meal_week_plans;
--   drop policy if exists meal_week_plans_delete on public.meal_week_plans;
--   create policy meal_week_plans_write_adult on public.meal_week_plans for all to authenticated using ((household_id IN ( SELECT m.household_id    FROM household_members m   WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text))))) with check ((household_id IN ( SELECT m.household_id    FROM household_members m   WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))));
--   create policy meal_week_plans_read on public.meal_week_plans for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- meal_week_template_options: 2 permissive policy(ies) -> one per command.
drop policy if exists meal_week_template_options_write_adult on public.meal_week_template_options;
drop policy if exists meal_week_template_options_read on public.meal_week_template_options;
create policy meal_week_template_options_select on public.meal_week_template_options
  for select to authenticated
  using (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy meal_week_template_options_insert on public.meal_week_template_options
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  );
create policy meal_week_template_options_update on public.meal_week_template_options
  for update to authenticated
  using (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  )
  with check (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  );
create policy meal_week_template_options_delete on public.meal_week_template_options
  for delete to authenticated
  using (
    ((household_id IN ( SELECT m.household_id
   FROM household_members m
  WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))))
  );
-- ROLLBACK:
--   drop policy if exists meal_week_template_options_select on public.meal_week_template_options;
--   drop policy if exists meal_week_template_options_insert on public.meal_week_template_options;
--   drop policy if exists meal_week_template_options_update on public.meal_week_template_options;
--   drop policy if exists meal_week_template_options_delete on public.meal_week_template_options;
--   create policy meal_week_template_options_write_adult on public.meal_week_template_options for all to authenticated using ((household_id IN ( SELECT m.household_id    FROM household_members m   WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text))))) with check ((household_id IN ( SELECT m.household_id    FROM household_members m   WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND (m.member_type = 'adult'::text)))));
--   create policy meal_week_template_options_read on public.meal_week_template_options for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- recipes: 2 permissive policy(ies) -> one per command.
drop policy if exists recipes_write_member on public.recipes;
drop policy if exists recipes_select_member on public.recipes;
create policy recipes_select on public.recipes
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy recipes_insert on public.recipes
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy recipes_update on public.recipes
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy recipes_delete on public.recipes
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists recipes_select on public.recipes;
--   drop policy if exists recipes_insert on public.recipes;
--   drop policy if exists recipes_update on public.recipes;
--   drop policy if exists recipes_delete on public.recipes;
--   create policy recipes_write_member on public.recipes for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy recipes_select_member on public.recipes for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- recipe_ingredients: 2 permissive policy(ies) -> one per command.
drop policy if exists recipe_ingredients_write_member on public.recipe_ingredients;
drop policy if exists recipe_ingredients_select_member on public.recipe_ingredients;
create policy recipe_ingredients_select on public.recipe_ingredients
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy recipe_ingredients_insert on public.recipe_ingredients
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy recipe_ingredients_update on public.recipe_ingredients
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy recipe_ingredients_delete on public.recipe_ingredients
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists recipe_ingredients_select on public.recipe_ingredients;
--   drop policy if exists recipe_ingredients_insert on public.recipe_ingredients;
--   drop policy if exists recipe_ingredients_update on public.recipe_ingredients;
--   drop policy if exists recipe_ingredients_delete on public.recipe_ingredients;
--   create policy recipe_ingredients_write_member on public.recipe_ingredients for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy recipe_ingredients_select_member on public.recipe_ingredients for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- pets: 2 permissive policy(ies) -> one per command.
drop policy if exists pets_write_admin on public.pets;
drop policy if exists pets_select_member on public.pets;
create policy pets_select on public.pets
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy pets_insert on public.pets
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy pets_update on public.pets
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy pets_delete on public.pets
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists pets_select on public.pets;
--   drop policy if exists pets_insert on public.pets;
--   drop policy if exists pets_update on public.pets;
--   drop policy if exists pets_delete on public.pets;
--   create policy pets_write_admin on public.pets for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy pets_select_member on public.pets for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- pet_care_needs: 2 permissive policy(ies) -> one per command.
drop policy if exists pet_care_needs_write_member on public.pet_care_needs;
drop policy if exists pet_care_needs_select_member on public.pet_care_needs;
create policy pet_care_needs_select on public.pet_care_needs
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy pet_care_needs_insert on public.pet_care_needs
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy pet_care_needs_update on public.pet_care_needs
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy pet_care_needs_delete on public.pet_care_needs
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
-- ROLLBACK:
--   drop policy if exists pet_care_needs_select on public.pet_care_needs;
--   drop policy if exists pet_care_needs_insert on public.pet_care_needs;
--   drop policy if exists pet_care_needs_update on public.pet_care_needs;
--   drop policy if exists pet_care_needs_delete on public.pet_care_needs;
--   create policy pet_care_needs_write_member on public.pet_care_needs for all to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households))) with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy pet_care_needs_select_member on public.pet_care_needs for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- pet_preferences: 2 permissive policy(ies) -> one per command.
drop policy if exists pet_preferences_write_admin on public.pet_preferences;
drop policy if exists pet_preferences_read on public.pet_preferences;
create policy pet_preferences_select on public.pet_preferences
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy pet_preferences_insert on public.pet_preferences
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) AND (EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = pet_preferences.pet_id) AND (p.household_id = pet_preferences.household_id))))))
  );
create policy pet_preferences_update on public.pet_preferences
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) AND (EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = pet_preferences.pet_id) AND (p.household_id = pet_preferences.household_id))))))
  );
create policy pet_preferences_delete on public.pet_preferences
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists pet_preferences_select on public.pet_preferences;
--   drop policy if exists pet_preferences_insert on public.pet_preferences;
--   drop policy if exists pet_preferences_update on public.pet_preferences;
--   drop policy if exists pet_preferences_delete on public.pet_preferences;
--   create policy pet_preferences_write_admin on public.pet_preferences for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check (((household_id IN ( SELECT wh.admin_households() AS admin_households)) AND (EXISTS ( SELECT 1    FROM pets p   WHERE ((p.id = pet_preferences.pet_id) AND (p.household_id = pet_preferences.household_id))))));
--   create policy pet_preferences_read on public.pet_preferences for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- usda_foods: the anon+authenticated deny-all overlapped the authenticated
-- SELECT policy for role authenticated. Dropping it leaves anon and all
-- writes denied by absence of any policy (RLS default-deny), and the
-- authenticated read unchanged. Rollback: recreate the deny-all.
drop policy if exists usda_foods_no_client_access on public.usda_foods;
-- ROLLBACK:
--   create policy usda_foods_no_client_access on public.usda_foods for all to anon, authenticated using (false) with check (false);

