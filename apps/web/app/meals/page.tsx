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
import { listMeals, listRecipeChoices, mealAgenda } from "@wonderhome/core/meals/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
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
  AttachRecipeControl,
  type MealFormLabels,
  PlanMealButton,
  SuggestMealButton,
} from "../_components/meal-forms";
import { mealFormLabels } from "../_lib/meal-form-labels";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Meals & Cooking" };
export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  name: string;
  active_minutes: number;
  total_minutes: number;
  serves: number;
  calories_per_serving: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
};
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
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, session] = await Promise.all([
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

  const [meals, agenda, members, recipeRows, preferenceRows, recipeChoices] =
    await Promise.all([
      listMeals(supabase, householdId, { from: today, to: weekEnd }).catch(
        () => [],
      ),
      mealAgenda(supabase, householdId).catch(() => null),
      listMembers(
        supabase,
        householdId,
        membership.household.ownerMemberId,
      ).catch(() => []),
      supabase
        .from("recipes")
        .select(
          "id, name, active_minutes, total_minutes, serves, calories_per_serving, protein_grams, carbs_grams, fat_grams",
        )
        .eq("household_id", householdId)
        .order("name")
        .limit(40),
      supabase
        .from("food_preferences")
        .select("id, member_id, kind, subject")
        .eq("household_id", householdId)
        .order("kind"),
      listRecipeChoices(supabase, householdId).catch(() => []),
    ]);

  const recipes = (recipeRows.data as RecipeRow[] | null) ?? [];
  const preferences = (preferenceRows.data as PreferenceRow[] | null) ?? [];
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
  const formLabels = mealFormLabels(t);

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
                              t={t}
                              labels={formLabels}
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
          recipes.length === 0 ? (
            <EmptyState
              icon={ChefHat}
              tone="meals"
              title={t("meals.recipes.emptyTitle")}
              description={t("meals.recipes.emptyLede")}
              action={<AddRecipeButton householdId={householdId} labels={formLabels} />}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recipes.map((recipe) => (
                <Card key={recipe.id} className="wh-lift p-3">
                  <div
                    aria-hidden
                    className="grid h-20 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-meals-soft)]"
                  >
                    <CookingPot className="size-8 text-[var(--wh-tone-meals)]" />
                  </div>
                  <p className="mt-2 text-sm font-semibold">{recipe.name}</p>
                  <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                    {t("meals.recipe.timeServes", { minutes: recipe.total_minutes, serves: recipe.serves })}
                  </p>
                  {recipe.calories_per_serving !== null ? (
                    <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                      {nutrientLine(t, {
                        kcal: recipe.calories_per_serving,
                        protein: recipe.protein_grams,
                        carbs: recipe.carbs_grams,
                        fat: recipe.fat_grams,
                      })}
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
          )
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
  t,
  labels,
}: {
  meal: Meal;
  cook: string | null;
  timezone: string;
  householdId: string;
  recipes: { id: string; name: string }[];
  t: Translate;
  labels: MealFormLabels;
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
        <p className="mt-2 flex items-center gap-1.5 rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-2.5 py-1.5 text-xs text-[var(--wh-attention)]">
          <ShoppingBasket aria-hidden className="size-3.5" />{" "}
          {t("meals.card.missing", { items: missing.map((need) => need.name).join(", ") })}
        </p>
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
        ) : (
          <AttachRecipeControl
            householdId={householdId}
            mealId={meal.id}
            recipes={recipes}
            labels={labels}
          />
        )}
        <PillLink href="/groceries?tab=list" tone="quiet">
          {t("meals.card.ingredients")}
        </PillLink>
        <PillLink
          href={`/ai?q=${encodeURIComponent(`Change ${meal.slot} on ${meal.onDate}`)}`}
          tone="quiet"
        >
          {t("meals.card.changeMeal")}
        </PillLink>
      </div>
    </Card>
  );
}
