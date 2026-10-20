import {
  ChefHat,
  ChevronLeft,
  ChevronRight,
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
import { listMeals, listRecipeChoices, listRecipesForEdit, mealAgenda } from "@wonderhome/core/meals/repository";
import { shiftDay, WEEK_SLOTS, weekCount, weekDays, weekFrom, weekStartOf } from "@wonderhome/core/meals/week";
import { DIETS, isDiet, type Diet } from "@wonderhome/core/meals/diet";
import { pickerDishes } from "@wonderhome/core/meals/recipe-picker";
import { nextOption, weekdayOf, type TemplateOption } from "@wonderhome/core/meals/week-template";
import { listTemplateOptions, planWeekFromTemplate, weekPlanned } from "@wonderhome/core/meals/week-template-repository";
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
import { mealFormLabels, recipePickerLabels } from "../_lib/meal-form-labels";
import { DietSettings } from "./diet-settings";
import { RepeatLastWeek } from "./week-controls";
import { MealIngredientsSheet } from "./meal-ingredients-sheet";
import { ChooseAgainButton, WeekPlanCard, WeekTemplateEditor } from "./week-template";
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
  searchParams: Promise<{ tab?: string; course?: string; week?: string; food?: string }>;
}) {
  const [{ tab, course, week, food }, session] = await Promise.all([
    searchParams,
    requireSession("/meals"),
  ]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();
  // The household's own day, and the week (Monday to Sunday) being planned.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const weekStart = weekFrom(week, today);
  const weekDates = weekDays(weekStart);
  const thisWeek = weekStartOf(today);

  const entitlement = await may(supabase, householdId, "meals.planning");
  const active = tab === "recipes" || tab === "preferences" || tab === "template" ? tab : "plan";
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

  const [agenda, members, recipes, preferenceRows, recipeChoices, groceries, catalog, firstWeekMeals, templateOptions, weekRecord] =
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
      // The week being planned, past days included, bounded to its seven days.
      active === "plan" ? listMeals(supabase, householdId, { from: weekDates[0], to: weekDates[6] }).catch(() => [] as Meal[]) : Promise.resolve([] as Meal[]),
      // The week template (the owner, 2026-10-20): its options, and whether WonderHome has planned this week from it.
      active === "plan" || active === "template" ? listTemplateOptions(supabase, householdId).catch(() => [] as TemplateOption[]) : Promise.resolve([] as TemplateOption[]),
      active === "plan" ? weekPlanned(supabase, householdId, weekStart) : Promise.resolve(null),
    ]);
  const adult = membership.memberType === "adult";
  // Each week WonderHome picks from the template and plans it, accepted by
  // default: the first time an adult opens a week not yet past that it has
  // not planned. Only empty slots are filled; the week is claimed once, so a
  // meal someone removed afterwards is not put back.
  let weekMeals = firstWeekMeals;
  let planned = weekRecord ? weekRecord.planned : null;
  if (active === "plan" && adult && templateOptions.length > 0 && weekRecord === false && weekDates[6]! >= today) {
    const filled = await planWeekFromTemplate(supabase, { householdId, week: weekStart, today, timezone, memberId: membership.memberId, once: true }).catch(() => null);
    if (filled) {
      planned = filled.planned;
      if (filled.planned > 0) weekMeals = await listMeals(supabase, householdId, { from: weekDates[0], to: weekDates[6] }).catch(() => firstWeekMeals);
    }
  }
  const meals = weekMeals;
  const words = groceryWords(t, viewer.language);

  const picked = RECIPE_COURSES.includes(course as RecipeCourse) ? (course as RecipeCourse) : null;
  // Veg / Non-veg beside WonderHome's ideas (the owner, 2026-10-20). An egg dish is not veg, so it shows with non-veg.
  const foodFilter = food === "veg" || food === "nonveg" ? food : null;
  const ideas = catalog.filter((dish) => (!picked || dish.course === picked) && (!foodFilter || (foodFilter === "veg" ? dish.diet === "veg" : dish.diet !== "veg")));
  const ideasHref = (next: { course?: RecipeCourse | null; food?: "veg" | "nonveg" | null }) => {
    const params = new URLSearchParams({ tab: "recipes" });
    const courseKey = next.course === undefined ? picked : next.course;
    const foodKey = next.food === undefined ? foodFilter : next.food;
    if (courseKey) params.set("course", courseKey);
    if (foodKey) params.set("food", foodKey);
    return `/meals?${params.toString()}`;
  };
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

  const tomorrow = shiftDay(today, 1);
  const dayWords = (date: Date) => new Intl.DateTimeFormat(viewer.language, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  const days = weekDates.map((key) => {
    const date = new Date(`${key}T12:00:00Z`);
    return {
      key,
      past: key < today,
      label: key === today ? `${t("meals.today")} · ${dayWords(date)}` : key === tomorrow ? `${t("meals.tomorrow")} · ${dayWords(date)}` : dayWords(date),
      meals: meals
        .filter((meal) => meal.onDate === key)
        .sort(
          (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
        ),
    };
  });

  const count = weekCount(weekDates, meals, today);
  const weekLabel = t("meals.week.label", { date: new Intl.DateTimeFormat(viewer.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${weekStart}T12:00:00Z`)) });

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
            ) : active === "template" ? null : (
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
              key: "template",
              label: t("meals.tab.template"),
              href: "/meals?tab=template",
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

            {/* The week (the owner, 2026-10-20: weekly meal planning): every day's breakfast, lunch and dinner, an empty slot one tap from planned. */}
            <section aria-label={weekLabel} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Link href={`/meals?week=${shiftDay(weekStart, -7)}`} aria-label={t("meals.week.previous")} className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]" scroll={false}>
                    <ChevronLeft aria-hidden className="size-5" />
                  </Link>
                  <div className="min-w-0 px-1">
                    <h2 className="text-base font-semibold">{weekStart === thisWeek ? t("meals.week.thisWeek") : weekLabel}</h2>
                    <p className="text-xs text-[var(--wh-foreground-muted)]">{t("meals.week.planned", { planned: count.planned, total: count.total })}</p>
                  </div>
                  <Link href={`/meals?week=${shiftDay(weekStart, 7)}`} aria-label={t("meals.week.next")} className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]" scroll={false}>
                    <ChevronRight aria-hidden className="size-5" />
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {weekStart !== thisWeek ? (
                    <PillLink href="/meals" tone="quiet" scroll={false}>
                      {t("meals.week.backToThis")}
                    </PillLink>
                  ) : null}
                  {weekDates[6]! >= today ? (
                    <RepeatLastWeek
                      householdId={householdId}
                      week={weekStart}
                      labels={{ action: t("meals.week.repeat"), working: t("meals.week.repeating"), copied: t("meals.week.copied", { count: "{count}" }), copiedOne: t("meals.week.copiedOne"), none: t("meals.week.copyNone") }}
                    />
                  ) : null}
                </div>
              </div>
              {weekDates[6]! >= today ? (
                <WeekPlanCard
                  householdId={householdId}
                  week={weekStart}
                  hasTemplate={templateOptions.length > 0}
                  canEdit={adult}
                  planned={planned}
                  labels={{
                    title: weekStart === thisWeek ? t("meals.template.planTitle") : t("meals.template.planTitleWeek", { date: weekLabel }),
                    planned: t("meals.template.planned", { count: "{count}" }),
                    plannedOne: t("meals.template.plannedOne"),
                    plannedNone: t("meals.template.plannedNone"),
                    fill: t("meals.template.fill"),
                    filling: t("meals.template.filling"),
                    filled: t("meals.template.filled", { count: "{count}" }),
                    filledOne: t("meals.template.filledOne"),
                    filledNone: t("meals.template.filledNone"),
                    setUp: t("meals.template.setUp"),
                    setUpLede: t("meals.template.setUpLede"),
                  }}
                />
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {days
                  .filter((day) => !day.past || day.meals.length > 0)
                  .map((day) => {
                    const slots = [...WEEK_SLOTS, ...(day.meals.some((meal) => meal.slot === "snack") ? (["snack"] as const) : [])].sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
                    return (
                      <section key={day.key} className={day.past ? "opacity-70" : undefined}>
                        <SectionHeader title={day.label} count={day.meals.length || undefined} />
                        <div className="space-y-2">
                          {slots.map((slot) => {
                            const planned = day.meals.filter((meal) => meal.slot === slot);
                            if (planned.length > 0)
                              return planned.map((meal) => (
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
                                  chooseAgain={meal.origin === "week_template" && nextOption({ options: templateOptions, weekday: weekdayOf(meal.onDate), slot: meal.slot, current: meal.recipe?.id ?? null }) !== null}
                                />
                              ));
                            if (day.past) return null;
                            return (
                              <PlanMealButton
                                key={slot}
                                householdId={householdId}
                                members={memberOptions}
                                recipes={recipeChoices}
                                {...plan}
                                labels={formLabels}
                                trigger="slot"
                                slot={slot}
                                onDate={day.key}
                                triggerLabel={t("meals.week.planSlot", { slot: formLabels.slots[slot], day: day.label })}
                              />
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
              </div>
            </section>
          </>
        ) : null}

        {active === "template" ? (
          <WeekTemplateEditor
            householdId={householdId}
            canEdit={adult}
            options={templateOptions}
            picker={plan}
            labels={{
              title: t("meals.template.title"),
              lede: t("meals.template.lede"),
              add: t("meals.template.add"),
              addTitle: t("meals.template.addTitle"),
              addLede: t("meals.template.addLede"),
              editTitle: t("meals.template.editTitle"),
              days: t("meals.template.days"),
              every: t("meals.template.every"),
              weekdays: t("meals.template.weekdays"),
              weekend: t("meals.template.weekend"),
              day: t("meals.template.day"),
              meal: t("meals.template.meal"),
              save: t("meals.template.save"),
              saving: t("meals.template.saving"),
              remove: t("meals.template.remove"),
              removeLabel: t("meals.template.removeLabel", { name: "{name}", day: "{day}", slot: "{slot}" }),
              editLabel: t("meals.template.editLabel", { name: "{name}", day: "{day}", slot: "{slot}" }),
              added: t("meals.template.added"),
              pickDish: t("meals.template.pickDish"),
              emptyTitle: t("meals.template.emptyTitle"),
              emptyLede: t("meals.template.emptyLede"),
              adultsOnly: t("meals.template.adultsOnly"),
              slotEmpty: t("meals.template.slotEmpty"),
              addToSlot: t("meals.template.addToSlot", { slot: "{slot}" }),
              // Monday first; 2026-10-19 is a Monday.
              dayNames: Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(viewer.language, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 19 + index, 12)))),
              slots: formLabels.slots,
            }}
          />
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
                <SectionHeader
                  title={t("recipes.ideas")}
                  count={ideas.length}
                />
                <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">{t("recipes.ideasLede")}</p>
                <div role="group" aria-label={t("recipes.food.label")} className="inline-flex gap-0.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] p-0.5">
                  {/* All · Veg · Non-veg (the owner, 2026-10-20): one picked at a time, All by default. */}
                  {([null, "veg", "nonveg"] as const).map((key) => {
                    const on = foodFilter === key;
                    return (
                      <Link
                        key={key ?? "all"}
                        href={ideasHref({ food: key })}
                        scroll={false}
                        aria-current={on ? "true" : undefined}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--wh-radius-pill)] px-3 text-xs font-semibold transition-colors ${on ? "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]" : "text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)]"}`}
                      >
                        {/* The mark Indian packs use: a green dot for veg, a brown one (the Meals tone) for non-veg — beside the word, never instead of it. */}
                        {key ? (
                          <span aria-hidden className={`grid size-3 place-items-center rounded-[2px] border ${key === "veg" ? "border-[var(--wh-handled)]" : "border-[var(--wh-tone-meals)]"}`}>
                            <span className={`size-1.5 rounded-full ${key === "veg" ? "bg-[var(--wh-handled)]" : "bg-[var(--wh-tone-meals)]"}`} />
                          </span>
                        ) : null}
                        {key === null ? t("recipes.course.all") : t(key === "veg" ? "recipes.food.veg" : "recipes.food.nonveg")}
                      </Link>
                    );
                  })}
                </div>
                <nav aria-label={t("recipes.course")} className="-mx-1 flex flex-wrap gap-2 px-1">
                  {[null, ...RECIPE_COURSES].map((key) => {
                    const on = key === picked;
                    return (
                      <PillLink
                        key={key ?? "all"}
                        href={ideasHref({ course: key })}
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
  chooseAgain,
}: {
  /** WonderHome picked it from the week template, and the template lists another dish for it. */
  chooseAgain: boolean;
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
            {meal.origin === "week_template" ? <span className="font-medium normal-case tracking-normal text-[var(--wh-primary)]"> · {t("meals.template.pick")}</span> : null}
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
        {chooseAgain ? (
          <ChooseAgainButton
            householdId={householdId}
            mealId={meal.id}
            onDate={meal.onDate}
            labels={{ action: t("meals.template.chooseAgain"), working: t("meals.template.choosing"), label: t("meals.template.chooseAgainLabel", { slot: labels.slots[meal.slot] }) }}
          />
        ) : null}
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
