import { ChefHat, CookingPot, Heart, ShoppingBasket, Sparkles, Utensils } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { listMembers } from "@wonderhome/core/identity/households";
import { startBy, type Meal } from "@wonderhome/core/meals/meals";
import { listMeals, mealAgenda } from "@wonderhome/core/meals/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaRow } from "../_components/agenda-row";
import { PlanMealButton } from "../_components/meal-forms";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Meals & Cooking" };
export const dynamic = "force-dynamic";

type RecipeRow = { id: string; name: string; active_minutes: number; total_minutes: number; serves: number };
type PreferenceRow = { id: string; member_id: string | null; kind: string; subject: string; note: string | null };

const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"] as const;

/**
 * Meals & Cooking (requirements §19): Plan, Recipes and Preferences.
 *
 * Plan is the week, today first. A meal card shows the meal, its status, who
 * is cooking, and whether the ingredients are in — and a missing essential
 * becomes a shopping dependency, not a note.
 */
export default async function MealsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/meals")]);
  const { supabase, membership, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const entitlement = await may(supabase, householdId, "meals.planning");
  const active = tab === "recipes" || tab === "preferences" ? tab : "plan";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/meals", back: { href: "/more", label: "Back" }, title: "Meals & Cooking", wide: active === "plan" };

  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={Utensils} tone="meals" title="Meal planning is not part of this plan" description={entitlement.reason} />
      </AppShell>
    );
  }

  const [meals, agenda, members, recipeRows, preferenceRows] = await Promise.all([
    listMeals(supabase, householdId, { from: today, to: weekEnd }).catch(() => []),
    mealAgenda(supabase, householdId).catch(() => null),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    supabase.from("recipes").select("id, name, active_minutes, total_minutes, serves").eq("household_id", householdId).order("name").limit(40),
    supabase.from("food_preferences").select("id, member_id, kind, subject, note").eq("household_id", householdId).order("kind"),
  ]);

  const recipes = (recipeRows.data as RecipeRow[] | null) ?? [];
  const preferences = (preferenceRows.data as PreferenceRow[] | null) ?? [];
  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.displayName ?? null;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() + index * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    return { key, label: index === 0 ? "Today" : index === 1 ? "Tomorrow" : formatDate(timezone, date, "long"), meals: meals.filter((meal) => meal.onDate === key).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)) };
  });

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Meals &amp; Cooking</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Healthy meals. Happier moods.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PlanMealButton householdId={householdId} members={members.map((member) => ({ id: member.id, displayName: member.displayName }))} />
            <PillLink href="/ai?q=Plan%20this%20week%27s%20dinners" tone="primary"><Sparkles aria-hidden className="size-3.5" /> Plan with AI</PillLink>
          </div>
        </header>

        <SegmentedControl
          label="Meals view"
          active={active}
          segments={[
            { key: "plan", label: "Plan", href: "/meals", count: agenda?.meals.length },
            { key: "recipes", label: "Recipes", href: "/meals?tab=recipes", count: recipes.length },
            { key: "preferences", label: "Preferences", href: "/meals?tab=preferences", count: preferences.length },
          ]}
        />

        {active === "plan" ? (
          <>
            {agenda && agenda.meals.length > 0 ? (
              <section>
                <SectionHeader title="About to go wrong" count={agenda.meals.length} />
                <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{agenda.meals.map((item) => <AgendaRow key={item.subjectKey} item={item} href="/meals" />)}</ul></Card>
              </section>
            ) : null}

            {meals.length === 0 ? (
              <EmptyState icon={Utensils} tone="meals" title="Nothing planned this week" description="Plan a meal and WonderHome checks the ingredients, the cook's time and everyone's preferences — then tells you what's missing." action={<PillLink href="/ai?q=Plan%20this%20week%27s%20dinners" tone="primary">Plan with AI</PillLink>} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {days.filter((day) => day.meals.length > 0 || day.key === today).map((day) => (
                  <section key={day.key}>
                    <SectionHeader title={day.label} />
                    {day.meals.length === 0 ? (
                      <Card className="p-4 text-sm text-[var(--wh-foreground-muted)]">Nothing planned yet.</Card>
                    ) : (
                      <div className="space-y-2">
                        {day.meals.map((meal) => <MealCard key={meal.id} meal={meal} cook={nameOf(meal.cookMemberId)} timezone={timezone} />)}
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
            <EmptyState icon={ChefHat} tone="meals" title="No recipes yet" description="Recipes hold ingredients and timing, so a planned meal knows what it needs and when to start." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recipes.map((recipe) => (
                <Card key={recipe.id} className="wh-lift p-3">
                  <div aria-hidden className="grid h-20 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-meals-soft)]"><CookingPot className="size-8 text-[var(--wh-tone-meals)]" /></div>
                  <p className="mt-2 truncate text-sm font-semibold">{recipe.name}</p>
                  <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{recipe.total_minutes} min · serves {recipe.serves}</p>
                </Card>
              ))}
            </div>
          )
        ) : null}

        {active === "preferences" ? (
          preferences.length === 0 ? (
            <EmptyState icon={Heart} tone="people" title="No preferences recorded" description="Allergies, dislikes and how the family likes to eat. Tell WonderHome in conversation and it remembers — allergies always win over everything else." action={<PillLink href="/ai?q=We%20prefer%20dinner%20at%208.">Tell WonderHome</PillLink>} />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {preferences.map((preference) => (
                  <ActionRow key={preference.id} icon={Heart} tone={preference.kind === "allergy" || preference.kind === "medical" ? "risk" : "people"} title={preference.subject} meta={`${nameOf(preference.member_id) ?? "Whole household"}${preference.note ? ` · ${preference.note}` : ""}`} action={<Badge tone={preference.kind === "allergy" || preference.kind === "medical" ? "risk" : "neutral"}>{preference.kind}</Badge>} />
                ))}
              </ul>
            </Card>
          )
        ) : null}

        <QuoteCard>Good food, happier moods.</QuoteCard>
      </div>
    </AppShell>
  );
}

function MealCard({ meal, cook, timezone }: { meal: Meal; cook: string | null; timezone: string }) {
  const missing = meal.ingredients.filter((need) => need.essential && need.status !== "have" && need.status !== "substituted");
  const begin = startBy(meal);
  const tone = meal.status === "at_risk" ? "attention" : meal.status === "ready" || meal.status === "eaten" ? "handled" : "neutral";

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[var(--wh-radius)] bg-[var(--wh-tone-meals-soft)] text-[var(--wh-tone-meals)]"><Utensils className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{meal.slot}</p>
          <p className="truncate text-sm font-semibold">{meal.name}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            Ready by {formatTime(timezone, meal.readyBy)}{begin ? ` · start ${formatTime(timezone, begin)}` : ""}{cook ? ` · ${cook}` : " · nobody assigned"}
          </p>
        </div>
        <Badge tone={tone}>{meal.status.replace(/_/g, " ")}</Badge>
      </div>
      {missing.length > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-2.5 py-1.5 text-xs text-[var(--wh-attention)]">
          <ShoppingBasket aria-hidden className="size-3.5" /> Missing: {missing.map((need) => need.name).join(", ")} — on the shopping list
        </p>
      ) : meal.ingredients.length > 0 ? (
        <p className="mt-2 text-xs text-[var(--wh-handled)]">All {meal.ingredients.length} ingredients in.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {meal.recipe ? <PillLink href="/meals?tab=recipes" tone="quiet">View recipe</PillLink> : null}
        <PillLink href="/groceries?tab=list" tone="quiet">Ingredients</PillLink>
        <PillLink href={`/ai?q=${encodeURIComponent(`Change ${meal.slot} on ${meal.onDate}`)}`} tone="quiet">Change meal</PillLink>
      </div>
    </Card>
  );
}
