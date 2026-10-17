import type { Translate } from "@wonderhome/core/i18n/translate";

import type { PlaceSearchLabels } from "../_components/place-search-field";

/** The place picker's words in the reader's language: setup's basics and children steps, and Manage Household. */
export function placeSearchLabels(t: Translate, kind: "address" | "school"): PlaceSearchLabels {
  return {
    placeholder: t(kind === "school" ? "places.school.placeholder" : "places.address.placeholder"),
    searching: t("places.searching"),
    nothingFound: t(kind === "school" ? "places.school.nothingFound" : "places.address.nothingFound"),
    change: t("places.change"),
    openInMaps: t("places.openInMaps"),
    hint: t(kind === "school" ? "places.school.hint" : "places.address.hint"),
    picked: t("places.picked"),
  };
}
