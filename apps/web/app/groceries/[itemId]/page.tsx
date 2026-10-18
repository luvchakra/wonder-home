import { History, PackageCheck, ShoppingBasket } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { NUTRIENT_KEYS } from "@wonderhome/core/commerce/catalog";
import {
  getGroceryItem,
  stockHistory,
  stockStatus,
} from "@wonderhome/core/commerce/inventory";
import {
  listConsumables,
  listPurchases,
} from "@wonderhome/core/commerce/repository";
import {
  convert,
  defaultStep,
  unitInfo,
} from "@wonderhome/core/commerce/units";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { groceryIcon } from "@wonderhome/core/ui/grocery-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { groceryWords } from "../../_lib/grocery-words";
import { formatDate, requireSession } from "../../_lib/session";
import { sayAmount } from "../_components/amounts";
import { ToBuyStepper } from "../_components/to-buy-stepper";
import {
  DetailsForm,
  PhotoForm,
  StockEditor,
  StopTracking,
  UseByForm,
} from "./item-controls";

export const metadata = { title: "Grocery item" };
export const dynamic = "force-dynamic";

const STATUS_TONE = {
  unknown: "neutral",
  none: "risk",
  low: "attention",
  enough: "handled",
} as const;

/**
 * One grocery item (design §3.2): what is at home and who said so, what is
 * to buy, a use-by date someone read off the pack, its details, what was
 * bought before and how the amount at home came to be what it is.
 */
export default async function GroceryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const [{ itemId }, session] = await Promise.all([
    params,
    requireSession("/groceries"),
  ]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const back = { href: "/groceries", label: t("grocery.item.back") };
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/groceries",
    back,
  };

  const entitlement = await may(supabase, householdId, "groceries.core");
  const item =
    entitlement.allowed && /^[0-9a-f-]{36}$/i.test(itemId)
      ? await getGroceryItem(supabase, householdId, itemId).catch(() => null)
      : null;
  if (!item) {
    return (
      <AppShell {...shell} title={t("nav.item.groceries")}>
        <EmptyState
          icon={ShoppingBasket}
          tone="care"
          title={t("grocery.item.notFound")}
          description={t("grocery.item.notFoundLede")}
        />
      </AppShell>
    );
  }

  const words = groceryWords(t, viewer.language);
  const [purchases, history, all] = await Promise.all([
    listPurchases(supabase, householdId, {
      consumableId: item.id,
      limit: 5,
    }).catch(() => []),
    stockHistory(supabase, householdId, item.id, 8).catch(() => []),
    listConsumables(supabase, householdId).catch(() => []),
  ]);
  const raw = all.find((entry) => entry.id === item.id);
  const adult = membership.memberType === "adult";
  const status = stockStatus(item);
  const base = unitInfo(item.unit).base;
  const unitWord = words.unitNames[unitInfo(item.unit).key] ?? item.unit;
  const sourceWord = (source: string) =>
    t(`grocery.item.source.${source}` as TranslationKey);
  const when = (iso: string) => formatDate(timezone, new Date(iso));
  const categories = [
    ...new Set([...all.map((entry) => entry.category), ...words.categories]),
  ];
  // A product's label nutrients, from the shared catalog (25-006): only what
  // the label states, with its basis and its source's credit.
  const nutrition = (() => {
    const catalog = item.catalog;
    if (!catalog || !catalog.nutrientBasis) return null;
    const number = new Intl.NumberFormat(viewer.language, { maximumFractionDigits: 1 });
    const rows = NUTRIENT_KEYS.flatMap((key) => {
      const value = catalog.nutrients[key];
      if (value === undefined) return [];
      const unit = key === "energy_kcal" ? "kcal" : key === "sodium_mg" ? "mg" : "g";
      return [{ key, label: words.nutrition.names[key], value: `${number.format(value)} ${unit}`, sub: key === "sugars_g" || key === "saturated_fat_g" }];
    });
    return rows.length > 0 ? { basis: catalog.nutrientBasis, rows } : null;
  })();

  return (
    <AppShell {...shell} title={item.name}>
      <div className="space-y-5">
        <header className="flex items-start gap-4">
          {item.imageUrl ? (
            // A signed, short-lived URL for the household's own photo; next/image would cache it past its expiry.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="size-24 shrink-0 rounded-[var(--wh-radius)] object-cover shadow-[var(--wh-shadow-card)]"
            />
          ) : item.catalog?.imageUrl ? (
            // The shared catalog's copy of the product picture (25-006), from WonderHome's own storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.catalog.imageUrl}
              alt=""
              className="size-24 shrink-0 rounded-[var(--wh-radius)] bg-[var(--wh-surface)] object-contain shadow-[var(--wh-shadow-card)]"
            />
          ) : (
            <IconTile
              icon={groceryIcon(item.name, item.category)}
              tone="care"
              size="lg"
              className="size-24 [&>svg]:size-10"
            />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="text-[length:var(--wh-text-title)] leading-tight font-bold tracking-tight break-words">
              {item.name}
            </h1>
            <p className="text-sm text-[var(--wh-foreground-muted)] first-letter:uppercase">
              {item.category}
            </p>
            <Badge tone={STATUS_TONE[status]}>{words.status[status]}</Badge>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {t("grocery.item.lede")}
            </p>
          </div>
        </header>
        {adult ? (
          <PhotoForm
            householdId={householdId}
            itemId={item.id}
            hasPhoto={Boolean(item.imagePath)}
            labels={{
              add: t("grocery.item.photo.add"),
              change: t("grocery.item.photo.change"),
              remove: t("grocery.item.photo.remove"),
              saving: t("grocery.item.photo.saving"),
            }}
          />
        ) : null}

        <Card className="space-y-3 p-4">
          <SectionHeader title={t("grocery.item.stockTitle")} />
          <p className="text-2xl font-bold tabular-nums">
            {item.stock
              ? sayAmount(
                  words,
                  { quantity: item.stock.quantity, unit: item.stock.unit },
                  item.unit,
                )
              : "—"}
          </p>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {item.stock
              ? item.stock.confirmedBy
                ? t("grocery.item.confirmedBy", {
                    name: item.stock.confirmedBy,
                    when: when(item.stock.confirmedAt),
                    source: sourceWord(item.stock.source),
                  })
                : t("grocery.item.confirmed", {
                    when: when(item.stock.confirmedAt),
                    source: sourceWord(item.stock.source),
                  })
              : t("grocery.item.stockUnknown")}
          </p>
          <StockEditor
            householdId={householdId}
            item={{
              id: item.id,
              name: item.name,
              unit: item.unit,
              step: item.step,
            }}
            stock={
              item.stock
                ? {
                    quantity: item.stock.quantity,
                    unit: item.stock.unit,
                    version: item.stock.version,
                  }
                : null
            }
            canEdit={adult}
            words={words}
            labels={{
              amount: t("grocery.item.stockAmount"),
              less: t("grocery.item.stockLess", { name: "{name}" }),
              more: t("grocery.item.stockMore", { name: "{name}" }),
              update: t("grocery.item.update"),
              updating: t("grocery.item.updating"),
              saved: t("grocery.item.stockSaved", { name: "{name}", amount: "{amount}" }),
              clamped: t("grocery.item.clamped"),
              conflict: t("grocery.item.stockConflict"),
              unknown: t("grocery.item.stockUnknown"),
              adultsOnly: t("grocery.item.adultsOnly"),
            }}
          />
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <SectionHeader title={t("grocery.item.toBuyTitle")} />
          <ToBuyStepper
            householdId={householdId}
            item={{
              id: item.id,
              name: item.name,
              unit: item.unit,
              step: item.step,
            }}
            initial={
              item.toBuy
                ? { quantity: item.toBuy.quantity, unit: item.toBuy.unit }
                : null
            }
            words={words}
            size="lg"
          />
        </Card>

        <Card className="space-y-3 p-4">
          <SectionHeader title={t("grocery.item.useBy")} />
          <p className="text-sm">
            {item.stock?.useBy
              ? `${formatDate(timezone, new Date(`${item.stock.useBy}T12:00:00Z`), "long")} · ${t("grocery.item.useByEntered")}`
              : t("grocery.item.useByNone")}
          </p>
          {adult && item.stock ? (
            <UseByForm
              householdId={householdId}
              itemId={item.id}
              useBy={item.stock.useBy}
              labels={{
                label: t("grocery.item.useByLabel"),
                save: t("grocery.item.useBySave"),
                clear: t("grocery.item.useByClear"),
                saving: t("grocery.item.saving"),
              }}
            />
          ) : null}
        </Card>

        <Card className="space-y-3 p-4">
          <SectionHeader title={t("grocery.item.details")} />
          <DetailsForm
            householdId={householdId}
            categories={categories}
            unitNames={words.unitNames}
            item={{
              id: item.id,
              name: item.name,
              category: item.category,
              unit: item.unit,
              step: item.step,
              lowLevelInUnit:
                item.lowLevel === null
                  ? null
                  : convert(item.lowLevel, base, item.unit),
              storage: item.storage,
              note: item.note,
              aliases: item.aliases,
              typicalQuantity: raw?.typicalQuantity ?? 1,
              daysPerUnit: raw?.daysPerUnit ?? null,
            }}
            labels={{
              name: t("grocery.add.name"),
              category: t("grocery.add.category"),
              categoryPlaceholder: t("grocery.add.categoryPlaceholder"),
              categoryNew: t("grocery.add.categoryNew"),
              unit: t("grocery.add.unit"),
              step: t("grocery.item.step"),
              stepHint: t("grocery.item.stepHint", {
                unit: unitWord,
                step: `${defaultStep(item.unit)}`,
              }),
              lowLevel: t("grocery.item.lowLevel"),
              lowLevelHint: t("grocery.item.lowLevelHint", { unit: unitWord }),
              storage: t("grocery.item.storage"),
              storageOptions: {
                "": t("grocery.item.storage.none"),
                fridge: t("grocery.item.storage.fridge"),
                freezer: t("grocery.item.storage.freezer"),
                pantry: t("grocery.item.storage.pantry"),
                other: t("grocery.item.storage.other"),
              },
              note: t("grocery.item.note"),
              aliases: t("grocery.item.aliases"),
              aliasesHint: t("grocery.item.aliasesHint"),
              save: t("grocery.item.save"),
              saving: t("grocery.item.saving"),
              addNew: t("grocery.picker.addNew"),
              chooseExisting: t("grocery.picker.chooseExisting"),
            }}
          />
        </Card>

        {nutrition ? (
          <Card className="space-y-3 p-4">
            <SectionHeader title={words.nutrition.title} />
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {[item.catalog?.brand, item.catalog?.name].filter(Boolean).join(" · ")}
              {" · "}
              {nutrition.basis === "100ml" ? words.nutrition.per100ml : words.nutrition.per100g}
            </p>
            <dl className="divide-y divide-[var(--wh-border)] text-sm">
              {nutrition.rows.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className={row.sub ? "pl-4 text-[var(--wh-foreground-muted)]" : "font-medium"}>{row.label}</dt>
                  <dd className="tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {words.nutrition.credit.replace("{source}", item.catalog?.attribution ?? "")}
            </p>
          </Card>
        ) : null}

        <section className="space-y-2">
          <SectionHeader title={t("grocery.item.purchases")} />
          {purchases.length === 0 ? (
            <p className="rounded-[var(--wh-radius)] bg-[var(--wh-surface)] p-4 text-sm text-[var(--wh-foreground-muted)]">
              {t("grocery.item.purchasesEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-4 shadow-[var(--wh-shadow-card)]">
              {purchases.map((purchase) => (
                <li key={purchase.id} className="flex items-center gap-3 py-3">
                  <IconTile icon={PackageCheck} tone="handled" size="sm" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">
                      {sayAmount(words, {
                        quantity: purchase.quantity,
                        unit: purchase.unit ?? item.unit,
                      })}
                    </span>
                    <span className="block text-xs text-[var(--wh-foreground-muted)]">
                      {formatDate(
                        timezone,
                        new Date(`${purchase.purchasedOn}T12:00:00Z`),
                      )}
                      {purchase.merchant
                        ? ` · ${t("grocery.item.from", { merchant: purchase.merchant })}`
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {history.length > 0 ? (
          <section className="space-y-2">
            <SectionHeader title={t("grocery.item.history")} />
            <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-4 shadow-[var(--wh-shadow-card)]">
              {history.map((entry) => {
                const amount = sayAmount(
                  words,
                  {
                    quantity:
                      entry.kind === "set" || entry.kind === "undo"
                        ? entry.after
                        : Math.abs(entry.delta),
                    unit: entry.unit,
                  },
                  item.unit,
                );
                return (
                  <li key={entry.at} className="flex items-center gap-3 py-3">
                    <IconTile icon={History} tone="neutral" size="sm" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">
                        {t(
                          `grocery.item.history.${entry.kind}` as TranslationKey,
                          { amount },
                        )}
                      </span>
                      <span className="block text-xs text-[var(--wh-foreground-muted)]">
                        {[entry.by, when(entry.at), sourceWord(entry.source)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2 rounded-[var(--wh-radius)] bg-[var(--wh-surface)] p-4">
          <StopTracking
            householdId={householdId}
            itemId={item.id}
            label={t("grocery.item.stop", { name: item.name })}
          />
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            {t("grocery.item.stopLede")}
          </p>
        </section>

        <QuoteCard>{t("grocery.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
