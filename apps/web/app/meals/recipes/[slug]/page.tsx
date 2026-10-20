import { ChefHat, Clock, CookingPot, Flame, Users } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { publicEnv } from "@wonderhome/core/config/env";
import { getCatalogRecipe } from "@wonderhome/core/meals/recipe-catalog";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { groceryWords } from "../../../_lib/grocery-words";
import { requireSession } from "../../../_lib/session";
import { CatalogRecipeActions } from "./catalog-actions";

export const metadata = { title: "Recipe" };
export const dynamic = "force-dynamic";

const FRYING_NOTE = "for frying; not counted in the nutrients";

/**
 * One dish from WonderHome's recipe catalog (25-022): its picture with the
 * photographer's credit, how long it takes, what one serving holds (and how
 * many ingredients that was counted from), what it needs with each grocery
 * item's picture, and its short steps. Plan it for a day, or keep a version
 * of your own to change.
 */
export default async function CatalogRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, session] = await Promise.all([params, requireSession("/meals")]);
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

  const valid = /^[a-z0-9-]{2,60}$/.test(slug);
  // The plan check, the dish and whether this household already keeps a copy start together.
  const [entitlement, dish, copy] = await Promise.all([
    may(supabase, householdId, "meals.planning"),
    valid ? getCatalogRecipe(supabase, slug, publicEnv().NEXT_PUBLIC_SUPABASE_URL).catch(() => null) : Promise.resolve(null),
    valid
      ? supabase
          .from("recipes")
          .select("id, recipe_catalog!inner(slug)")
          .eq("household_id", householdId)
          .eq("active", true)
          .eq("recipe_catalog.slug", slug)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!entitlement.allowed || !dish) {
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

  const words = groceryWords(t, viewer.language);
  const number = new Intl.NumberFormat(viewer.language, { maximumFractionDigits: 2 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: membership.household.timezone }).format(new Date());
  const defaultSlot = dish.course === "breakfast" ? "breakfast" : dish.course === "snack" || dish.course === "sweet" ? "snack" : "dinner";
  const facts = [
    { icon: Clock, label: t("recipes.prep"), value: t("recipes.minutesShort", { minutes: dish.prepMinutes }) },
    { icon: Flame, label: t("recipes.cook"), value: t("recipes.minutesShort", { minutes: dish.cookMinutes }) },
    { icon: Users, label: t("recipes.forPeople"), value: number.format(dish.serves) },
  ];
  const nutrients =
    dish.caloriesPerServing !== null
      ? [
          { label: t("recipes.energy"), value: t("recipes.kcalValue", { value: number.format(dish.caloriesPerServing) }) },
          dish.proteinGrams !== null ? { label: t("recipes.protein"), value: t("recipes.gramsValue", { value: number.format(dish.proteinGrams) }) } : null,
          dish.carbsGrams !== null ? { label: t("recipes.carbs"), value: t("recipes.gramsValue", { value: number.format(dish.carbsGrams) }) } : null,
          dish.fatGrams !== null ? { label: t("recipes.fat"), value: t("recipes.gramsValue", { value: number.format(dish.fatGrams) }) } : null,
        ].filter((row): row is { label: string; value: string } => row !== null)
      : [];
  // Weights and volumes by their symbol (200 g); pieces and bunches by name.
  const amount = (quantity: number, unit: string) =>
    `${number.format(quantity)} ${["g", "kg", "ml", "l"].includes(unit) ? unit : (words.unitNames[unit] ?? unit)}`;
  const essentials = dish.ingredients.filter((line) => !line.optional);
  const extras = dish.ingredients.filter((line) => line.optional);

  const ingredientRow = (line: (typeof dish.ingredients)[number], index: number) => (
    <li key={`${line.name}-${index}`} className="flex items-center gap-3 py-2.5">
      {line.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the shared catalog's own picture, from public storage
        <img src={line.imageUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] object-contain" />
      ) : (
        <IconTile icon={CookingPot} tone="meals" size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words">{line.name}</p>
        {line.note ? (
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{line.note === FRYING_NOTE ? t("recipes.forFrying") : line.note}</p>
        ) : null}
      </div>
      <p className="shrink-0 text-sm text-[var(--wh-foreground-muted)] tabular-nums">{amount(line.quantity, line.unit)}</p>
    </li>
  );

  return (
    <AppShell {...shell} title={dish.name}>
      <div className="space-y-5">
        <header className="wh-rise space-y-3">
          {dish.imageUrl ? (
            <figure className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- the catalog's own copy of a Commons picture, already sized */}
              <img src={dish.imageUrl} alt={dish.name} className="aspect-[16/10] w-full rounded-[var(--wh-radius)] object-cover shadow-[var(--wh-shadow-card)] sm:aspect-[21/9]" />
              {dish.image?.attribution ? (
                <figcaption className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                  {t("recipes.photo", { author: dish.image.attribution, licence: dish.image.licence ?? "CC" })}
                  {dish.image.sourceUrl ? (
                    <>
                      {" · "}
                      <a href={dish.image.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        {t("recipes.photoSource")}
                      </a>
                    </>
                  ) : null}
                </figcaption>
              ) : null}
            </figure>
          ) : null}
          <div>
            <h1 className="text-[1.625rem] font-bold tracking-tight break-words sm:text-3xl">{dish.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone="meals">{t(`recipes.course.${dish.course}`)}</Badge>
              <Badge>{t(`recipes.diet.${dish.diet}`)}</Badge>
              {dish.region ? <span className="text-xs text-[var(--wh-foreground-subtle)]">{dish.region}</span> : null}
            </div>
            {dish.description ? <p className="mt-2 text-sm text-[var(--wh-foreground-muted)]">{dish.description}</p> : null}
          </div>
          <CatalogRecipeActions
            householdId={householdId}
            slug={dish.slug}
            name={dish.name}
            defaultSlot={defaultSlot}
            today={today}
            saved={Boolean(copy.data)}
            labels={{
              plan: t("recipes.plan"),
              planTitle: t("recipes.planTitle", { name: "{name}" }),
              planDescription: t("recipes.planDescription"),
              planSubmit: t("recipes.planSubmit"),
              planning: t("recipes.planning"),
              slot: t("mealForm.slot"),
              slots: {
                breakfast: t("reminder.meal.slot.breakfast"),
                lunch: t("reminder.meal.slot.lunch"),
                snack: t("reminder.meal.slot.snack"),
                dinner: t("reminder.meal.slot.dinner"),
              },
              date: t("mealForm.date"),
              readyBy: t("mealForm.readyBy"),
              save: t("recipes.save"),
              saving: t("recipes.saving"),
              saved: t("recipes.saved", { link: "{link}" }),
              savedLink: t("recipes.savedLink"),
              inYours: t("recipes.inYours"),
              openYours: t("recipes.openYours"),
            }}
          />
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
            <section>
              <SectionHeader title={t("recipes.perServing")} />
              <Card className="p-4">
                {nutrients.length > 0 ? (
                  <>
                    <dl className="grid grid-cols-2 gap-3">
                      {nutrients.map((row) => (
                        <div key={row.label} className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
                          <dt className="text-xs text-[var(--wh-foreground-subtle)]">{row.label}</dt>
                          <dd className="text-base font-semibold">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {dish.nutritionCounted !== null && dish.nutritionTotal !== null ? (
                      <p className="mt-3 text-xs text-[var(--wh-foreground-subtle)]">
                        {t("recipes.nutritionFrom", { counted: dish.nutritionCounted, total: dish.nutritionTotal })}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-[var(--wh-foreground-muted)]">{t("recipes.nutritionNone")}</p>
                )}
              </Card>
            </section>

            <section>
              <SectionHeader title={t("recipes.ingredients")} count={essentials.length} />
              <Card className="px-4 py-1">
                <ul className="divide-y divide-[var(--wh-border)]">{essentials.map(ingredientRow)}</ul>
              </Card>
              {extras.length > 0 ? (
                <>
                  <p className="mt-3 mb-1 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("recipes.optional")}</p>
                  <Card className="px-4 py-1">
                    <ul className="divide-y divide-[var(--wh-border)]">{extras.map(ingredientRow)}</ul>
                  </Card>
                </>
              ) : null}
            </section>
          </div>

          <section>
            <SectionHeader title={t("recipes.steps")} count={dish.steps.length} />
            <Card className="p-4">
              <ol className="space-y-4">
                {dish.steps.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--wh-surface-muted)] text-xs font-bold text-[var(--wh-foreground)]"
                    >
                      {index + 1}
                    </span>
                    <p className="pt-0.5 text-sm leading-relaxed">{step}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        </div>

        <QuoteCard>{t("meals.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
