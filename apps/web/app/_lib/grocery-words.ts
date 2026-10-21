import { NUTRIENT_KEYS } from "@wonderhome/core/commerce/catalog";
import { COUNTED_UNITS, UNIT_CHOICES } from "@wonderhome/core/commerce/units";
import type {
  Translate,
  TranslationKey,
} from "@wonderhome/core/i18n/translate";

/**
 * The Groceries screens' words, resolved on the server in the reader's
 * language (story 22-004) and handed to the client components as plain
 * strings. Templates keep their `{name}`/`{amount}` placeholders, filled in
 * the browser with the household's own item names, which are never
 * translated.
 *
 * Count words ("pc"/"pcs", "bunch"/"bunches") are resolved for every plural
 * category the language has, so the stepper can say "1 pc" and "6 pcs" in
 * the reader's language as the number changes.
 */
export type GroceryWords = ReturnType<typeof groceryWords>;

const SAMPLES = [0, 1, 2, 3, 5, 11, 21, 100, 1.5];

/** Placeholders the browser fills, kept as they are by the server's translator (which drops any it is not given). */
const KEEP = { name: "{name}", amount: "{amount}", query: "{query}", reason: "{reason}" };

export function groceryWords(translate: Translate, language: string | undefined) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(key, { ...KEEP, ...params });
  language ??= "en";
  const plural = new Intl.PluralRules(language);
  const categories = new Map<string, number>();
  for (const sample of SAMPLES) {
    const category = plural.select(sample);
    if (!categories.has(category)) categories.set(category, sample);
  }
  const countUnits = ["pcs", "dozen", ...COUNTED_UNITS];
  const unitWords: Record<string, Record<string, string>> = {};
  for (const unit of countUnits) {
    unitWords[unit] = Object.fromEntries(
      [...categories].map(([category, sample]) => [
        category,
        t(`grocery.unit.${unit}` as TranslationKey, { count: sample }),
      ]),
    );
  }
  const unitNames: Record<string, string> = {};
  for (const unit of UNIT_CHOICES) {
    unitNames[unit] = ["g", "kg", "ml", "l", "pcs", "dozen"].includes(unit)
      ? t(`grocery.unitName.${unit}` as TranslationKey)
      : (unitWords[unit]?.one ?? unitWords[unit]?.other ?? unit);
  }

  return {
    language,
    unitWords,
    unitNames,
    categories: t("grocery.categories")
      .split("|")
      .map((word) => word.trim())
      .filter(Boolean),
    search: t("grocery.search"),
    filterLegend: t("grocery.filter.legend"),
    filterAll: t("grocery.filter.all"),
    inStock: t("grocery.col.inStock"),
    toBuy: t("grocery.col.toBuy"),
    status: {
      unknown: t("grocery.status.unknown"),
      none: t("grocery.status.none"),
      low: t("grocery.status.low"),
      enough: t("grocery.status.enough"),
    },
    open: t("grocery.open"),
    stepper: {
      addToList: t("grocery.stepper.addToList"),
      less: t("grocery.stepper.less"),
      more: t("grocery.stepper.more"),
      amount: t("grocery.stepper.amount"),
      now: t("grocery.stepper.now"),
      none: t("grocery.stepper.none"),
      conflict: t("grocery.stepper.conflict"),
      failed: t("grocery.stepper.failed"),
      remove: t("grocery.stepper.remove"),
      removeLabel: t("grocery.stepper.removeLabel"),
    },
    summary: {
      atHome: t("grocery.summary.atHome"),
      notCounted: t("grocery.summary.notCounted"),
    },
    stockStepper: {
      less: t("grocery.stock.less"),
      more: t("grocery.stock.more"),
      amount: t("grocery.stock.amount"),
      now: t("grocery.stock.now"),
      none: t("grocery.stock.none"),
      title: t("grocery.stock.title"),
    },
    amountSheet: {
      title: t("grocery.amount.title"),
      amount: t("grocery.amount.amount"),
      unit: t("grocery.amount.unit"),
      save: t("grocery.amount.save"),
      remove: t("grocery.amount.remove"),
      invalid: t("grocery.amount.invalid"),
      countedIn: t("grocery.amount.countedIn"),
      countedInHint: t("grocery.amount.countedInHint"),
      otherUnit: t("grocery.amount.otherUnit"),
      otherUnitLabel: t("grocery.amount.otherUnitLabel"),
      otherUnitPlaceholder: t("grocery.amount.otherUnitPlaceholder"),
      recount: t("grocery.amount.recount", { unit: "{unit}" }),
      changeUnit: t("grocery.amount.changeUnit", { unit: "{unit}" }),
      unitChanged: t("grocery.amount.unitChanged", { unit: "{unit}" }),
    },
    row: {
      kcal: t("grocery.row.kcal", { value: "{value}" }),
      protein: t("grocery.row.protein", { value: "{value}" }),
      per100g: t("grocery.row.per100g"),
      per100ml: t("grocery.row.per100ml"),
      nutrition: t("grocery.row.nutrition"),
    },
    empty: {
      title: t("grocery.empty.title"),
      lede: t("grocery.empty.lede"),
      noMatch: t("grocery.empty.noMatch"),
    },
    toBuyEmpty: {
      title: t("grocery.toBuy.emptyTitle"),
      lede: t("grocery.toBuy.emptyLede"),
    },
    bought: {
      open: t("grocery.markBought"),
      title: t("grocery.bought.title"),
      description: t("grocery.bought.description"),
      on: t("grocery.bought.on"),
      include: t("grocery.bought.include"),
      amountOf: t("grocery.bought.amountOf"),
      recording: t("grocery.bought.recording"),
      nothingChosen: t("grocery.bought.nothingChosen"),
      plurals: {
        confirm: pluralTable(t, "grocery.bought.confirm", categories),
        done: pluralTable(t, "grocery.bought.done", categories),
        partial: pluralTable(t, "grocery.bought.partial", categories),
        failedAfter: pluralTable(t, "grocery.bought.failedAfter", categories),
      },
    },
    add: {
      open: t("grocery.add"),
      title: t("grocery.add.title"),
      description: t("grocery.add.description"),
      search: t("grocery.add.search"),
      addToList: t("grocery.add.addToList"),
      onList: t("grocery.add.onList"),
      trackAgain: t("grocery.add.trackAgain"),
      notTracked: t("grocery.add.notTracked"),
      notHere: t("grocery.add.notHere"),
      newItem: t("grocery.add.newItem"),
      name: t("grocery.add.name"),
      category: t("grocery.add.category"),
      categoryPlaceholder: t("grocery.add.categoryPlaceholder"),
      categoryNew: t("grocery.add.categoryNew"),
      unit: t("grocery.add.unit"),
      toBuy: t("grocery.add.toBuy"),
      inStock: t("grocery.add.inStock"),
      inStockHint: t("grocery.add.inStockHint"),
      submit: t("grocery.add.submit"),
      adding: t("grocery.add.adding"),
      duplicate: t("grocery.add.duplicate"),
      useExisting: t("grocery.add.useExisting"),
      addAnyway: t("grocery.add.addAnyway"),
      added: t("grocery.add.added"),
      pickerAddNew: t("grocery.picker.addNew"),
      pickerChooseExisting: t("grocery.picker.chooseExisting"),
      catalog: t("grocery.add.catalog"),
      catalogAdd: t("grocery.add.catalogAdd"),
      catalogSearching: t("grocery.add.catalogSearching"),
      catalogFailed: t("grocery.add.catalogFailed"),
      catalogCredit: t("grocery.add.catalogCredit"),
      catalogConfirm: t("grocery.add.catalogConfirm"),
      picturesCredit: t("grocery.add.picturesCredit"),
    },
    nutrition: {
      title: t("grocery.item.nutrition"),
      per100g: t("grocery.item.nutritionPer100g"),
      per100ml: t("grocery.item.nutritionPer100ml"),
      credit: t("grocery.item.nutritionCredit", { source: "{source}" }),
      perEdible: t("grocery.item.nutritionPerEdible"),
      close: t("grocery.item.nutritionClose", { food: "{food}" }),
      approximate: t("grocery.item.nutritionApproximate", { food: "{food}" }),
      energyComputed: t("grocery.item.nutritionEnergyComputed"),
      ifctCredit: t("grocery.item.nutritionIfctCredit"),
      usdaCredit: t("grocery.item.nutritionUsdaCredit"),
      pictureCredit: t("grocery.item.pictureCredit", { credit: "{credit}" }),
      names: Object.fromEntries(NUTRIENT_KEYS.map((nutrient) => [nutrient, t(`grocery.nutrient.${nutrient}` as TranslationKey)])) as Record<(typeof NUTRIENT_KEYS)[number], string>,
    },
  };
}

/** `{category: template}` for one plural key, so the client picks by its own count. */
function pluralTable(
  t: Translate,
  key: string,
  categories: Map<string, number>,
): Record<string, string> {
  // The sample number is put back as `{count}` for the client to fill with its own.
  return Object.fromEntries(
    [...categories].map(([category, sample]) => [
      category,
      t(key as TranslationKey, { count: sample, reason: "{reason}" }).replace(
        String(sample),
        "{count}",
      ),
    ]),
  );
}
