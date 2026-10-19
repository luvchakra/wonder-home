import { EVENT_CATEGORIES, EVENT_VISIBILITIES } from "@wonderhome/core/calendar/projection";
import { RECURRENCE_FREQUENCIES } from "@wonderhome/core/calendar/recurrence";
import type { Translate } from "@wonderhome/core/i18n/translate";

import type { EventCalendarLabels, NewEventFormLabels } from "../_components/new-event-form";
import { placeSearchLabels } from "./place-labels";
import { EVENT_KINDS, type EventKind } from "./event-kinds";

/** The calendar fields' words (story 12-009), shared by the add sheet and the edit sheet. */
export function eventCalendarLabels(t: Translate): EventCalendarLabels {
  return {
    allDay: t("calendar.form.allDay"),
    date: t("calendar.form.date"),
    endDate: t("calendar.form.endDate"),
    who: t("calendar.form.who"),
    whoHint: t("calendar.form.whoHint"),
    category: t("calendar.form.category"),
    categoryFromKind: t("calendar.form.categoryFromKind"),
    categories: EVENT_CATEGORIES.map((value) => ({ value, label: t(`calendar.category.${value}`) })),
    more: t("calendar.form.more"),
    repeat: t("calendar.form.repeat"),
    repeats: (["none", ...RECURRENCE_FREQUENCIES] as const).map((value) => ({ value, label: t(`calendar.form.repeat.${value}`) })),
    repeatUntil: t("calendar.form.repeatUntil"),
    visibility: t("calendar.form.visibility"),
    visibilities: EVENT_VISIBILITIES.map((value) => ({ value, label: t(`calendar.form.visibility.${value}`) })),
    visibilityHint: t("calendar.form.visibilityHint"),
    notes: t("calendar.form.notes"),
    clash: t("calendar.form.clash"),
    anyway: t("calendar.form.anyway"),
  };
}

/**
 * The "Add to the family calendar" sheet's words in the viewer's language (story 22-004).
 * `placeSearch` (`eventPlaceSearch`) offers Google Maps for "Where"; without it the place is typed.
 */
export function eventFormLabels(t: Translate, options: { placeSearch?: boolean } = {}): NewEventFormLabels {
  return {
    add: t("eventForm.add"),
    title: t("eventForm.title"),
    description: t("eventForm.description"),
    what: t("eventForm.what"),
    whatPlaceholder: t("eventForm.whatPlaceholder"),
    kind: t("eventForm.kind"),
    kinds: Object.fromEntries(EVENT_KINDS.map((kind) => [kind, t(`eventForm.kind.${kind}`)])) as Record<EventKind, string>,
    starts: t("eventForm.starts"),
    ends: t("eventForm.ends"),
    where: t("eventForm.where"),
    wherePlaceholder: t("eventForm.wherePlaceholder"),
    place: options.placeSearch ? placeSearchLabels(t, "event") : null,
    protect: t("eventForm.protect"),
    protectHint: t("eventForm.protectHint"),
    adding: t("eventForm.adding"),
    submit: t("eventForm.submit"),
    calendar: eventCalendarLabels(t),
  };
}
