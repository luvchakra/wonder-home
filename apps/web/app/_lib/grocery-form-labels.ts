import type { Translate } from "@wonderhome/core/i18n/translate";

import type { ConsumableFormLabels } from "../_components/commerce-forms";

/** The Groceries add/edit sheet's words in the viewer's language (story 22-004). */
export function groceryFormLabels(t: Translate): ConsumableFormLabels {
  return {
    add: t("groceryForm.add"),
    title: t("groceryForm.title"),
    description: t("groceryForm.description"),
    name: t("groceryForm.name"),
    namePlaceholder: t("groceryForm.namePlaceholder"),
    nameNew: t("groceryForm.nameNew"),
    category: t("groceryForm.category"),
    categoryPlaceholder: t("groceryForm.categoryPlaceholder"),
    categoryNew: t("groceryForm.categoryNew"),
    usualAmount: t("groceryForm.usualAmount"),
    unit: t("groceryForm.unit"),
    unitPlaceholder: t("groceryForm.unitPlaceholder"),
    unitNew: t("groceryForm.unitNew"),
    lasts: t("groceryForm.lasts"),
    lastsHint: t("groceryForm.lastsHint"),
    addNew: t("common.addNew"),
    chooseExisting: t("common.chooseExisting"),
    submit: t("groceryForm.submit"),
    adding: t("common.adding"),
    // `{name}` is filled in by the sheet with the item's own name.
    edit: t("groceryForm.edit", { name: "{name}" }),
    editDescription: t("groceryForm.editDescription"),
    save: t("groceryForm.save"),
    saving: t("common.saving"),
    stop: t("groceryForm.stop", { name: "{name}" }),
  };
}
