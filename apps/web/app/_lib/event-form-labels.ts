import type { Translate } from "@wonderhome/core/i18n/translate";

import type { NewEventFormLabels } from "../_components/new-event-form";
import { EVENT_KINDS, type EventKind } from "./event-kinds";

/** The "Add to the family calendar" sheet's words in the viewer's language (story 22-004). */
export function eventFormLabels(t: Translate): NewEventFormLabels {
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
    protect: t("eventForm.protect"),
    protectHint: t("eventForm.protectHint"),
    adding: t("eventForm.adding"),
    submit: t("eventForm.submit"),
  };
}
