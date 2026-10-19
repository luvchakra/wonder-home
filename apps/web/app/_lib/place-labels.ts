import type { Translate } from "@wonderhome/core/i18n/translate";

import type { PlaceSearchLabels } from "../_components/place-search-field";

/**
 * The place picker's words in the reader's language: setup's basics and children steps, Manage Household, a person's office,
 * the place book, and an event's "Where" (`event`: the same search as `place`, worded for a typed answer being kept too).
 */
export function placeSearchLabels(t: Translate, kind: "address" | "school" | "office" | "place" | "event"): PlaceSearchLabels {
  return {
    placeholder: t(`places.${kind}.placeholder`),
    searching: t("places.searching"),
    nothingFound: t(`places.${kind}.nothingFound`),
    change: t("places.change"),
    openInMaps: t("places.openInMaps"),
    hint: t(`places.${kind}.hint`),
    picked: t("places.picked"),
  };
}
