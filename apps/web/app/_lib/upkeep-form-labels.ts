import type { Translate } from "@wonderhome/core/i18n/translate";

import type { UpkeepFormLabels } from "../_components/home-forms";

/** The Home & Upkeep sheets' words in the viewer's language (story 22-004). */
export function upkeepFormLabels(t: Translate): UpkeepFormLabels {
  return {
    addAsset: t("upkeepForm.addAsset"),
    assetDescription: t("upkeepForm.assetDescription"),
    name: t("upkeepForm.name"),
    namePlaceholder: t("upkeepForm.namePlaceholder"),
    category: t("upkeepForm.category"),
    // Keyed by the stored value, which the form sends unchanged.
    categories: {
      appliance: t("upkeepForm.category.appliance"),
      fixture: t("upkeepForm.category.fixture"),
      vehicle: t("upkeepForm.category.vehicle"),
      electronics: t("upkeepForm.category.electronics"),
      furniture: t("upkeepForm.category.furniture"),
      other: t("upkeepForm.category.other"),
    },
    location: t("upkeepForm.location"),
    locationPlaceholder: t("upkeepForm.locationPlaceholder"),
    interval: t("upkeepForm.interval"),
    intervalHint: t("upkeepForm.intervalHint"),
    lastServiced: t("upkeepForm.lastServiced"),
    adding: t("common.adding"),
    submitAsset: t("upkeepForm.submitAsset"),
    raise: t("upkeepForm.raise"),
    requestTitle: t("upkeepForm.requestTitle"),
    requestDescription: t("upkeepForm.requestDescription"),
    subject: t("upkeepForm.subject"),
    subjectPlaceholder: t("upkeepForm.subjectPlaceholder"),
    provider: t("upkeepForm.provider"),
    providerPlaceholder: t("upkeepForm.providerPlaceholder"),
    providerContact: t("upkeepForm.providerContact"),
    providerContactPlaceholder: t("upkeepForm.providerContactPlaceholder"),
    raising: t("upkeepForm.raising"),
    submitRequest: t("upkeepForm.submitRequest"),
  };
}
