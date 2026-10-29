import { ChefHat, Clock, CookingPot, Flame, Users } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { publicEnv } from "@wonderhome/core/config/env";
import { listRecipesForEdit } from "@wonderhome/core/meals/repository";
import { listCatalogRecipes } from "@wonderhome/core/meals/recipe-catalog";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { groceryWords } from "../../../../_lib/grocery-words";
import { requireSession } from "../../../../_lib/session";

export const metadata = { title: "Recipe" };
export const dynamic = "force-dynamic";

/** One of the household's own recipes, whole (rule 21): its picture, time, serves, nutrition, what it needs and how it is made. */
export default async function OwnRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, requireSession("/meals")]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/meals",
    back: { href: "/meals?tab=recipes", label: t("recipes.back") },
  };

  const [entitlement, recipes] = await Promise.all([
    may(supabase, householdId, "meals.planning"),
    listRecipesForEdit(supabase, householdId).catch(() => []),
  ]);
  const recipe = recipes.find((row) => row.id === id) ?? null;
  if (!entitlement.allowed || !recipe) {
    return (
      <AppShell {...shell} title={t("meals.title")}>
        <EmptyState
          icon={ChefHat}
          tone="meals"
          title={entitlement.allowed ? t("recipes.notFound") : t("meals.notInPlan")}
          description={entitlement.allowed ? t("recipes.notFoundLede") : entitlement.reason}
        />
      </AppShell>
    );
  }

  const picture = recipe.catalogRecipeId
    ? ((await listCatalogRecipes(supabase, publicEnv().NEXT_PUBLIC_SUPABASE_URL).catch(() => [])).find((dish) => dish.id === recipe.catalogRecipeId)?.imageUrl ?? null)
    : null;
  const words = groceryWords(t, viewer.language);
  const number = new Intl.NumberFormat(viewer.language, { maximumFractionDigits: 2 });
  const amount = (quantity: number, unit: string) =>
    `${number.format(quantity)} ${["g", "kg", "ml", "l"].includes(unit) ? unit : (words.unitNames[unit] ?? unit)}`;
  const facts = [
    { icon: Clock, label: t("recipes.prep"), value: t("recipes.minutesShort", { minutes: recipe.activeMinutes }) },
    { icon: Flame, label: t("recipes.cook"), value: t("recipes.minutesShort", { minutes: recipe.totalMinutes }) },
    { icon: Users, label: t("recipes.forPeople"), value: number.format(recipe.serves) },
  ];
  const nutrients = [
    recipe.caloriesPerServing !== null ? { label: t("recipes.energy"), value: t("recipes.kcalValue", { value: number.format(recipe.caloriesPerServing) }) } : null,
    recipe.proteinGrams !== null ? { label: t("recipes.protein"), value: t("recipes.gramsValue", { value: number.format(recipe.proteinGrams) }) } : null,
    recipe.carbsGrams !== null ? { label: t("recipes.carbs"), value: t("recipes.gramsValue", { value: number.format(recipe.carbsGrams) }) } : null,
    recipe.fatGrams !== null ? { label: t("recipes.fat"), value: t("recipes.gramsValue", { value: number.format(recipe.fatGrams) }) } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
  const steps = (recipe.method ?? "").split(/\r?\n/).map((line) => line.replace(/^\s*(?:\d+[.)]\s*)?/, "").trim()).filter(Boolean);

  return (
    <AppShell {...shell} title={recipe.name}>
      <div className="space-y-5">
        <header className="wh-rise space-y-3">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- a catalog picture from public storage, already sized
            <img src={picture} alt={recipe.name} className="aspect-[16/10] w-full rounded-[var(--wh-radius)] object-cover shadow-[var(--wh-shadow-card)] sm:aspect-[21/9]" />
          ) : (
            <div aria-hidden className="grid aspect-[16/7] w-full place-items-center rounded-[var(--wh-radius)] bg-[var(--wh-tone-meals-soft)]">
              <CookingPot className="size-12 text-[var(--wh-tone-meals)]" />
            </div>
          )}
          <div>
            <h1 className="text-[1.625rem] font-bold tracking-tight break-words sm:text-3xl">{recipe.name}</h1>
            {recipe.cuisine ? (
              <div className="mt-1">
                <Badge tone="meals">{recipe.cuisine}</Badge>
              </div>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {facts.map((fact, index) => (
            <Card key={fact.label} className={`flex items-center gap-3 p-3 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
              <IconTile icon={fact.icon} tone="meals" size="sm" />
              <div className="min-w-0">
                <p className="text-xs text-[var(--wh-foreground-subtle)]">{fact.label}</p>
                <p className="text-sm font-semibold">{fact.value}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            {nutrients.length > 0 ? (
              <section>
                <SectionHeader title={t("recipes.perServing")} />
                <Card className="grid grid-cols-2 gap-3 p-4">
                  {nutrients.map((row) => (
                    <div key={row.label}>
                      <p className="text-xs text-[var(--wh-foreground-subtle)]">{row.label}</p>
                      <p className="text-sm font-semibold tabular-nums">{row.value}</p>
                    </div>
                  ))}
                </Card>
              </section>
            ) : null}
            <section>
              <SectionHeader title={t("recipes.ingredients")} count={recipe.essentials.length + recipe.optional.length} />
              <Card className="divide-y divide-[var(--wh-border)] px-4">
                {recipe.essentials.map((line, index) => (
                  <div key={`${line.name}-${index}`} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={CookingPot} tone="meals" size="sm" />
                    <p className="min-w-0 flex-1 text-sm font-medium break-words">{line.name}</p>
                    <p className="shrink-0 text-sm text-[var(--wh-foreground-muted)] tabular-nums">{amount(line.quantity, line.unit)}</p>
                  </div>
                ))}
                {recipe.optional.map((name, index) => (
                  <div key={`${name}-${index}`} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={CookingPot} tone="meals" size="sm" />
                    <p className="min-w-0 flex-1 text-sm font-medium break-words">{name}</p>
                    <Badge>{t("recipes.optional")}</Badge>
                  </div>
                ))}
              </Card>
            </section>
          </div>
          {steps.length > 0 ? (
            <section>
              <SectionHeader title={t("recipes.steps")} count={steps.length} />
              <Card className="p-4">
                <ol className="space-y-3">
                  {steps.map((step, index) => (
                    <li key={index} className="flex gap-3 text-sm">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--wh-tone-meals-soft)] text-xs font-semibold text-[var(--wh-tone-meals)]">{index + 1}</span>
                      <span className="min-w-0 break-words">{step}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
