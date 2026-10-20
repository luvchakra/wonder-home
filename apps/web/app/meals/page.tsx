import {
  ChefHat,
  CookingPot,
  Heart,
  ShoppingBasket,
  Utensils,
} from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import {
  isHouseholdAdmin,
  listMembers,
} from "@wonderhome/core/identity/households";
import { startBy, type Meal } from "@wonderhome/core/meals/meals";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { listGroceries, type GroceryItem } from "@wonderhome/core/commerce/inventory";
import { listRecipeChoices, listRecipesForEdit, mealAgenda } from "@wonderhome/core/meals/repository";
import { DIET_CLASHES, DIETS, isDiet, type Diet, type DietClash } from "@wonderhome/core/meals/diet";
import { pickerDishes } from "@wonderhome/core/meals/recipe-picker";
import { listCatalogRecipes, RECIPE_COURSES, type RecipeCourse } from "@wonderhome/core/meals/recipe-catalog";
import { publicEnv } from "@wonderhome/core/config/env";
import { itemFor } from "@wonderhome/core/meals/shortfall";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import Link from "next/link";

import { ActionRow } from "@wonderhome/core/ui/action-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Card } from "@wonderhome/core/ui/card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaRow } from "../_components/agenda-row";
import {
  AddPreferenceButton,
  AddRecipeButton,
  ChangeMealButton,
  EditRecipeButton,
  type MealFormLabels,
  PlanMealButton,
  SuggestMealButton,
} from "../_components/meal-forms";
import { groceryWords, type GroceryWords } from "../_lib/grocery-words";
import { mealFormLabels } from "../_lib/meal-form-labels";
import type { RecipePickerLabels } from "../_components/recipe-picker";
import { DietSettings } from "./diet-settings";
import { MealIngredientsSheet } from "./meal-ingredients-sheet";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Meals & Cooking" };
export const dynamic = "force-dynamic";

type PreferenceRow = {
  id: string;
  member_id: string | null;
  kind: string;
  subject: string;
};

const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"] as const;

/**
 * Meals & Cooking (requirements §19): Plan, Recipes and Preferences.
 *
 * Plan is the week, today first. A meal card shows the meal, its status, who
 * is cooking, and whether the ingredients are in — and a missing essential
 * becomes a shopping dependency, not a note.
 */
export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; course?: string }>;
}) {
  const [{ tab, course }, session] = await Promise.all([
    searchParams,
    requireSession("/meals"),
  ]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const entitlement = await may(supabase, householdId, "meals.planning");
  const active = tab === "recipes" || tab === "preferences" ? tab : "plan";
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/meals",
    back: { href: "/more", label: t("common.back") },
    title: t("meals.title"),
    wide: active === "plan",
  };

  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={Utensils}
          tone="meals"
          title={t("meals.notInPlan")}
          description={entitlement.reason}
        />
      </AppShell>
    );
  }

  const [agenda, members, recipes, preferenceRows, recipeChoices, groceries, catalog] =
    await Promise.all([
      // Every meal from today on, read once: the agenda assesses them and the
      // week below is the same rows, not a second read.
      mealAgenda(supabase, householdId).catch(() => null),
      listMembers(
        supabase,
        householdId,
        membership.household.ownerMemberId,
      ).catch(() => []),
      // The household's own recipes, whole: their cards, their edit forms and the pickers.
      listRecipesForEdit(supabase, householdId).catch(() => []),
      supabase
        .from("food_preferences")
        .select("id, member_id, kind, subject")
        .eq("household_id", householdId)
        .order("kind"),
      listRecipeChoices(supabase, householdId).catch(() => []),
      // What is at home and on the list, for each meal's shortfall (25-003a).
      listGroceries(supabase, householdId).catch(() => [] as GroceryItem[]),
      // WonderHome's own dishes (25-022): the Recipes tab, and the recipe picker in Plan a meal.
      active !== "preferences"
        ? listCatalogRecipes(supabase, publicEnv().NEXT_PUBLIC_SUPABASE_URL).catch(() => [])
        : Promise.resolve([]),
    ]);
  const meals = (agenda?.rows ?? []).filter((meal) => meal.onDate >= today && meal.onDate <= weekEnd);
  const words = groceryWords(t, viewer.language);

  const picked = RECIPE_COURSES.includes(course as RecipeCourse) ? (course as RecipeCourse) : null;
  const ideas = picked ? catalog.filter((dish) => dish.course === picked) : catalog;
  const pictureOf = new Map(catalog.map((dish) => [dish.id, dish.imageUrl]));
  const allPreferences = (preferenceRows.data as PreferenceRow[] | null) ?? [];
  // A diet has its own section and its own picker; the list below is everything else.
  const preferences = allPreferences.filter((preference) => preference.kind !== "diet");
  const dietOf = (memberId: string | null): Diet | null => {
    const subject = allPreferences.find((preference) => preference.kind === "diet" && preference.member_id === memberId)?.subject;
    return isDiet(subject) ? subject : null;
  };
  const familyDiet = dietOf(null);
  const nameOf = (id: string | null) =>
    members.find((member) => member.id === id)?.displayName ?? null;
  const admin = isHouseholdAdmin(membership);
  const memberOptions = members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
  }));
  // For attaching to an already-planned meal — every recipe is offered,
  // since that flow has no availability signal of its own to prioritise by.
  const recipeOptions = recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
  }));
  const formLabels = mealFormLabels(t, words.unitNames);
  const dietWords = Object.fromEntries(DIETS.map((diet) => [diet, t(`meals.diet.${diet}` as TranslationKey)])) as Record<Diet, string>;
  const pickerLabels = recipePickerLabels(t, dietWords);
  const dishes = pickerDishes(recipeChoices, catalog);
  const dietPeople = members.flatMap((member) => {
    const diet = dietOf(member.id);
    return diet ? [{ name: member.displayName, diet }] : [];
  });
  const plan = { dishes, familyDiet, people: dietPeople, pickerLabels };

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() + index * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label:
        index === 0
          ? t("meals.today")
          : index === 1
            ? t("meals.tomorrow")
            : formatDate(timezone, date, "long"),
      meals: meals
        .filter((meal) => meal.onDate === key)
        .sort(
          (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
        ),
    };
  });

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">
              {t("meals.title")}
            </h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {t("meals.lede")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {active === "recipes" ? (
              <AddRecipeButton householdId={householdId} labels={formLabels} />
            ) : active === "preferences" ? (
              <AddPreferenceButton
                householdId={householdId}
                currentMemberId={membership.memberId}
                admin={admin}
                members={memberOptions}
                labels={formLabels}
              />
            ) : (
              <>
                <SuggestMealButton householdId={householdId} labels={formLabels} />
                <PlanMealButton
                  householdId={householdId}
                  members={memberOptions}
                  recipes={recipeChoices}
                  {...plan}
                  labels={formLabels}
                />
              </>
            )}
          </div>
        </header>

        <SegmentedControl
          label={t("meals.view")}
          active={active}
          segments={[
            {
              key: "plan",
              label: t("meals.tab.plan"),
              href: "/meals",
              count: agenda?.meals.length,
            },
            {
              key: "recipes",
              label: t("meals.tab.recipes"),
              href: "/meals?tab=recipes",
              count: recipes.length,
            },
            {
              key: "preferences",
              label: t("meals.tab.preferences"),
              href: "/meals?tab=preferences",
              count: preferences.length,
            },
          ]}
        />

        {active === "plan" ? (
          <>
            {agenda && agenda.meals.length > 0 ? (
              <section>
                <SectionHeader
                  title={t("meals.aboutToGoWrong")}
                  count={agenda.meals.length}
                />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {agenda.meals.map((item) => (
                      <AgendaRow
                        key={item.subjectKey}
                        item={item}
                        href="/meals"
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}

            {meals.length === 0 ? (
              <EmptyState
                icon={Utensils}
                tone="meals"
                title={t("meals.empty.title")}
                description={t("meals.empty.lede")}
                action={
                  <PlanMealButton
                    householdId={householdId}
                    members={memberOptions}
                    recipes={recipeChoices}
                    {...plan}
                    labels={formLabels}
                  />
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {days
                  .filter((day) => day.meals.length > 0 || day.key === today)
                  .map((day) => (
                    <section key={day.key}>
                      <SectionHeader title={day.label} />
                      {day.meals.length === 0 ? (
                        <Card className="p-4 text-sm text-[var(--wh-foreground-muted)]">
                          {t("meals.nothingPlannedYet")}
                        </Card>
                      ) : (
                        <div className="space-y-2">
                          {day.meals.map((meal) => (
                            <MealCard
                              key={meal.id}
                              meal={meal}
                              cook={nameOf(meal.cookMemberId)}
                              timezone={timezone}
                              householdId={householdId}
                              recipes={recipeOptions}
                              members={memberOptions}
                              t={t}
                              labels={formLabels}
                              groceries={groceries}
                              words={words}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
              </div>
            )}
          </>
        ) : null}

        {active === "recipes" ? (
          <>
            <section>
              <SectionHeader title={t("recipes.yours")} count={recipes.length} />
              {recipes.length === 0 ? (
                <Card className="flex items-start gap-3 p-4">
                  <IconTile icon={ChefHat} tone="meals" />
                  <p className="text-sm text-[var(--wh-foreground-muted)]">{t("recipes.yoursEmpty")}</p>
                </Card>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {recipes.map((recipe) => {
                    const picture = recipe.catalogRecipeId ? (pictureOf.get(recipe.catalogRecipeId) ?? null) : null;
                    return (
                      <Card key={recipe.id} className="wh-lift flex flex-col p-3">
                        {picture ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a catalog picture from public storage, already sized
                          <img src={picture} alt="" loading="lazy" className="h-24 w-full rounded-[var(--wh-radius-sm)] object-cover" />
                        ) : (
                          <div aria-hidden className="grid h-24 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-meals-soft)]">
                            <CookingPot className="size-8 text-[var(--wh-tone-meals)]" />
                          </div>
                        )}
                        <div className="mt-2 flex items-start gap-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold break-words">{recipe.name}</p>
                            <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                              {t("meals.recipe.timeServes", { minutes: recipe.totalMinutes, serves: recipe.serves })}
                            </p>
                            {recipe.caloriesPerServing !== null ? (
                              <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                                {nutrientLine(t, {
                                  kcal: recipe.caloriesPerServing,
                                  protein: recipe.proteinGrams,
                                  carbs: recipe.carbsGrams,
                                  fat: recipe.fatGrams,
                                })}
                              </p>
                            ) : null}
                          </div>
                          <EditRecipeButton householdId={householdId} labels={formLabels} recipe={recipe} />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {catalog.length > 0 ? (
              <section className="space-y-3">
                <SectionHeader title={t("recipes.ideas")} count={catalog.length} />
                <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">{t("recipes.ideasLede")}</p>
                <nav aria-label={t("recipes.course")} className="-mx-1 flex flex-wrap gap-2 px-1">
                  {[null, ...RECIPE_COURSES].map((key) => {
                    const on = key === picked;
                    return (
                      <PillLink
                        key={key ?? "all"}
                        href={key ? `/meals?tab=recipes&course=${key}` : "/meals?tab=recipes"}
                        tone={on ? "primary" : "quiet"}
                        aria-current={on ? "page" : undefined}
                        scroll={false}
                      >
                        {key ? t(`recipes.course.${key}`) : t("recipes.course.all")}
                      </PillLink>
                    );
                  })}
                </nav>
                {ideas.length === 0 ? (
                  <Card className="p-4 text-sm text-[var(--wh-foreground-muted)]">{t("recipes.courseEmpty")}</Card>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {ideas.map((dish) => (
                      <Link
                        key={dish.id}
                        href={`/meals/recipes/${dish.slug}`}
                        className="group rounded-[var(--wh-radius)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
                      >
                        <Card className="wh-lift h-full overflow-hidden p-0">
                          {dish.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a catalog picture from public storage, already sized
                            <img src={dish.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                          ) : (
                            <div aria-hidden className="grid aspect-[4/3] place-items-center bg-[var(--wh-tone-meals-soft)]">
                              <CookingPot className="size-8 text-[var(--wh-tone-meals)]" />
                            </div>
                          )}
                          <div className="space-y-0.5 p-3">
                            <p className="text-sm font-semibold break-words">{dish.name}</p>
                            <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                              {[
                                t("recipes.minutes", { minutes: dish.prepMinutes + dish.cookMinutes }),
                                t("recipes.serves", { serves: dish.serves }),
                                t(`recipes.diet.${dish.diet}`),
                              ].join(" · ")}
                            </p>
                            {dish.caloriesPerServing !== null ? (
                              <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                                {t("recipes.kcal", { kcal: dish.caloriesPerServing })}
                              </p>
                            ) : null}
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ) : recipes.length === 0 ? (
              <EmptyState
                icon={ChefHat}
                tone="meals"
                title={t("meals.recipes.emptyTitle")}
                description={t("meals.recipes.emptyLede")}
                action={<AddRecipeButton householdId={householdId} labels={formLabels} />}
              />
            ) : null}
          </>
        ) : null}

        {active === "preferences" ? (
          <DietSettings
            householdId={householdId}
            family={familyDiet}
            people={members.map((member) => ({
              memberId: member.id,
              name: member.displayName,
              diet: dietOf(member.id),
              canEdit: admin || member.id === membership.memberId,
            }))}
            labels={{
              title: t("meals.diet.title"),
              lede: t("meals.diet.lede"),
              family: t("meals.diet.family"),
              notSet: t("meals.diet.notSet"),
              diets: dietWords,
              dietOf: t("meals.diet.dietOf", { name: "{name}" }),
              saved: t("meals.diet.saved"),
            }}
          />
        ) : null}

        {active === "preferences" ? (
          preferences.length === 0 ? (
            <EmptyState
              icon={Heart}
              tone="people"
              title={t("meals.prefs.emptyTitle")}
              description={t("meals.prefs.emptyLede")}
              action={
                <AddPreferenceButton
                  householdId={householdId}
                  currentMemberId={membership.memberId}
                  admin={admin}
                  members={memberOptions}
                  labels={formLabels}
                />
              }
            />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {preferences.map((preference) => (
                  <ActionRow
                    key={preference.id}
                    icon={Heart}
                    tone={
                      preference.kind === "allergy" ||
                      preference.kind === "medical"
                        ? "risk"
                        : "people"
                    }
                    title={preference.subject}
                    meta={nameOf(preference.member_id) ?? t("meals.wholeHousehold")}
                    action={
                      <Badge
                        tone={
                          preference.kind === "allergy" ||
                          preference.kind === "medical"
                            ? "risk"
                            : "neutral"
                        }
                      >
                        {preferenceKindWords(t, preference.kind)}
                      </Badge>
                    }
                  />
                ))}
              </ul>
            </Card>
          )
        ) : null}

        <QuoteCard>{t("meals.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

const PREFERENCE_KIND_KEYS = {
  allergy: "meals.prefKind.allergy",
  medical: "meals.prefKind.medical",
  ethical: "meals.prefKind.ethical",
  dislike: "meals.prefKind.dislike",
  preference: "meals.prefKind.preference",
  diet: "meals.prefKind.diet",
} as const;

/** The recipe picker's words (`RecipePicker`), in the reader's language. */
function recipePickerLabels(t: Translate, diets: Record<Diet, string>): RecipePickerLabels {
  return {
    label: t("mealForm.fromRecipe"),
    oneOff: t("mealForm.oneOff"),
    search: t("mealForm.picker.search"),
    fits: t("mealForm.picker.fits"),
    any: t("mealForm.picker.any"),
    anyCalories: t("mealForm.picker.anyCalories"),
    anyProtein: t("mealForm.picker.anyProtein"),
    dishDiets: { veg: t("recipes.diet.veg"), egg: t("recipes.diet.egg"), non_veg: t("recipes.diet.non_veg") },
    diets,
    clashes: Object.fromEntries(DIET_CLASHES.map((clash) => [clash, t(`meals.dietClash.${clash}` as TranslationKey)])) as Record<DietClash, string>,
    filterDiet: t("mealForm.picker.filterDiet"),
    filterCalories: t("mealForm.picker.filterCalories"),
    filterProtein: t("mealForm.picker.filterProtein"),
    under: t("mealForm.picker.under", { kcal: "{kcal}" }),
    atLeast: t("mealForm.picker.atLeast", { grams: "{grams}" }),
    sort: t("mealForm.picker.sort"),
    sortSuggested: t("mealForm.picker.sortSuggested"),
    sortProtein: t("mealForm.picker.sortProtein"),
    sortCalories: t("mealForm.picker.sortCalories"),
    yours: t("mealForm.picker.yours"),
    ready: t("mealForm.readyToCook"),
    missing: t("mealForm.missingIngredient"),
    fromWonderHome: t("mealForm.picker.fromWonderHome"),
    nutrition: t("mealForm.picker.nutrition", { kcal: "{kcal}", protein: "{protein}" }),
    caloriesOnly: t("mealForm.picker.caloriesOnly", { kcal: "{kcal}" }),
    proteinOnly: t("mealForm.picker.proteinOnly", { protein: "{protein}" }),
    notCounted: t("mealForm.picker.notCounted"),
    time: t("mealForm.picker.time", { minutes: "{minutes}", serves: "{serves}" }),
    notFor: t("mealForm.picker.notFor", { name: "{name}", diet: "{diet}", reason: "{reason}" }),
    empty: t("mealForm.picker.empty"),
    savedOnPlan: t("mealForm.picker.savedOnPlan", { name: "{name}" }),
  };
}

/** A preference's kind in the reader's words; a kind the catalog does not know is shown as stored. */
function preferenceKindWords(t: Translate, kind: string): string {
  const key = PREFERENCE_KIND_KEYS[kind as keyof typeof PREFERENCE_KIND_KEYS];
  return key ? t(key) : kind;
}

/** "450 kcal · 18g protein · 55g carbs · 12g fat" in the reader's words; a nutrient not recorded is left out. */
function nutrientLine(
  t: Translate,
  values: { kcal: number; protein: number | null; carbs: number | null; fat: number | null },
): string {
  return [
    t("meals.nutrient.kcal", { kcal: values.kcal }),
    values.protein !== null ? t("meals.nutrient.protein", { grams: values.protein }) : null,
    values.carbs !== null ? t("meals.nutrient.carbs", { grams: values.carbs }) : null,
    values.fat !== null ? t("meals.nutrient.fat", { grams: values.fat }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function MealCard({
  meal,
  cook,
  timezone,
  householdId,
  recipes,
  members,
  t,
  labels,
  groceries,
  words,
}: {
  meal: Meal;
  cook: string | null;
  timezone: string;
  householdId: string;
  recipes: { id: string; name: string }[];
  members: { id: string; displayName: string }[];
  t: Translate;
  labels: MealFormLabels;
  groceries: GroceryItem[];
  words: GroceryWords;
}) {
  const missing = meal.ingredients.filter(
    (need) =>
      need.essential && need.status !== "have" && need.status !== "substituted",
  );
  const begin = startBy(meal);
  const tone =
    meal.status === "at_risk"
      ? "attention"
      : meal.status === "ready" || meal.status === "eaten"
        ? "handled"
        : "neutral";
  const nutrients =
    meal.recipe?.caloriesPerServing != null
      ? t("meals.nutrient.perServing", {
          nutrients: nutrientLine(t, {
            kcal: meal.recipe.caloriesPerServing,
            protein: meal.recipe.proteinGrams ?? null,
            carbs: meal.recipe.carbsGrams ?? null,
            fat: meal.recipe.fatGrams ?? null,
          }),
        })
      : null;

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-[var(--wh-radius)] bg-[var(--wh-tone-meals-soft)] text-[var(--wh-tone-meals)]"
        >
          <Utensils className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
            {labels.slots[meal.slot]}
          </p>
          <p className="text-sm font-semibold">{meal.name}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            {[
              t("meals.card.readyBy", { time: formatTime(timezone, meal.readyBy) }),
              begin ? t("meals.card.start", { time: formatTime(timezone, begin) }) : null,
              cook ?? t("meals.card.nobodyAssigned"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge tone={tone}>{t(`meals.status.${meal.status}`)}</Badge>
      </div>
      {missing.length > 0 ? (
        // What is on the list is said to be; what is not is "still to get" —
        // never "on the shopping list" for something nobody added.
        <div className="mt-2 space-y-1">
          {missing.some((need) => need.status !== "shopping") ? (
            <p className="flex items-center gap-1.5 rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-2.5 py-1.5 text-xs text-[var(--wh-attention)]">
              <ShoppingBasket aria-hidden className="size-3.5" />{" "}
              {t("meals.card.stillNeeded", { items: missing.filter((need) => need.status !== "shopping").map((need) => need.name).join(", ") })}
            </p>
          ) : null}
          {missing.some((need) => need.status === "shopping") ? (
            <p className="text-xs text-[var(--wh-foreground-muted)]">
              {t("meals.card.missing", { items: missing.filter((need) => need.status === "shopping").map((need) => need.name).join(", ") })}
            </p>
          ) : null}
        </div>
      ) : meal.ingredients.length > 0 ? (
        <p className="mt-2 text-xs text-[var(--wh-handled)]">
          {t("meals.card.allIn", { count: meal.ingredients.length })}
        </p>
      ) : null}
      {nutrients ? (
        <p className="mt-1.5 text-xs text-[var(--wh-foreground-subtle)]">
          {nutrients}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {meal.recipe ? (
          <PillLink href="/meals?tab=recipes" tone="quiet">
            {t("meals.card.viewRecipe")}
          </PillLink>
        ) : null}
        <MealIngredientsSheet
          householdId={householdId}
          mealId={meal.id}
          ingredients={meal.ingredients}
          groceries={meal.ingredients.flatMap((need) => {
            const item = itemFor(need, groceries);
            return item ? [item] : [];
          })}
          recipeServes={meal.recipe?.serves ?? null}
          recipes={recipes}
          servings={meal.servings ?? null}
          words={{ language: words.language, unitWords: words.unitWords }}
          labels={{
            trigger: t("meals.card.ingredients"),
            title: t("grocery.meal.title", { name: meal.name }),
            lede: t("grocery.meal.lede"),
            servings: t("grocery.meal.servings"),
            servingsHint: t("grocery.meal.servingsHint", { count: "{count}" }),
            needs: t("grocery.meal.needs", { amount: "{amount}" }),
            have: t("grocery.meal.have", { amount: "{amount}" }),
            haveUnknown: t("grocery.meal.haveUnknown"),
            onList: t("grocery.meal.onList", { amount: "{amount}" }),
            add: t("grocery.meal.add", { amount: "{amount}" }),
            estimate: t("grocery.meal.estimate"),
            unmeasured: t("grocery.meal.unmeasured"),
            covered: t("grocery.meal.covered", { names: "{names}" }),
            none: t("grocery.meal.none"),
            noIngredients: t("grocery.meal.noIngredients"),
            open: t("grocery.meal.open"),
            failed: t("grocery.meal.failed"),
            addAll: pluralTemplates(t, "grocery.meal.addAll", words.language),
            added: pluralTemplates(t, "grocery.meal.added", words.language),
            empty: {
              lede: labels.noIngredientsYet,
              write: labels.writeIngredients,
              rows: labels.rows,
              unitNames: labels.unitNames,
              save: labels.saveIngredients,
              saving: labels.saving,
              orRecipe: labels.orRecipe,
              noRecipe: labels.noRecipe,
              useRecipe: labels.useRecipe,
            },
          }}
        />
        <ChangeMealButton
          householdId={householdId}
          meal={{
            id: meal.id,
            name: meal.name,
            slot: meal.slot,
            onDate: meal.onDate,
            readyByTime: new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(meal.readyBy),
            cookMemberId: meal.cookMemberId,
            recipeId: meal.recipe?.id ?? null,
          }}
          members={members}
          recipes={recipes}
          labels={labels}
        />
      </div>
    </Card>
  );
}

/** `{category: template}` for one plural key in this language, `{count}` kept for the browser to fill. */
function pluralTemplates(t: Translate, key: string, language: string): Record<string, string> {
  const plural = new Intl.PluralRules(language);
  const table: Record<string, string> = {};
  for (const sample of [0, 1, 2, 3, 5, 11, 21, 100]) {
    const category = plural.select(sample);
    if (!table[category]) table[category] = t(key as TranslationKey, { count: sample }).replace(String(sample), "{count}");
  }
  return table;
}
