import type { Translate } from "@wonderhome/core/i18n/translate";

import type { BackupServiceFormLabels } from "../_components/backup-service-forms";
import type { HelperFormLabels } from "../_components/helper-forms";

/** The Househelper sheets' words in the viewer's language (story 22-004). */
export function helperFormLabels(t: Translate): HelperFormLabels {
  return {
    recordLeave: t("helperForm.recordLeave"),
    leaveTitle: t("helperForm.leaveTitle"),
    leaveDescription: t("helperForm.leaveDescription"),
    who: t("helperForm.who"),
    date: t("helperForm.date"),
    whichWay: t("helperForm.whichWay"),
    awayThatDay: t("helperForm.awayThatDay"),
    extraDay: t("helperForm.extraDay"),
    reason: t("helperForm.reason"),
    reasonPlaceholder: t("helperForm.reasonPlaceholder"),
    recording: t("helperForm.recording"),
    record: t("helperForm.record"),
    setDays: t("helperForm.setDays"),
    changeDays: t("helperForm.changeDays"),
    // `{name}` is filled in by the sheet with the helper's own name.
    daysTitle: t("helperForm.daysTitle", { name: "{name}" }),
    daysDescription: t("helperForm.daysDescription"),
    days: t("helperForm.days"),
    // Sunday-first: the index is the stored day of the week.
    dayNames: [
      t("helperForm.day.0"),
      t("helperForm.day.1"),
      t("helperForm.day.2"),
      t("helperForm.day.3"),
      t("helperForm.day.4"),
      t("helperForm.day.5"),
      t("helperForm.day.6"),
    ],
    from: t("helperForm.from"),
    to: t("helperForm.to"),
    saving: t("common.saving"),
    savePattern: t("helperForm.savePattern"),
    kind: t("helperForm.kind"),
    kindRegular: t("helperForm.kindRegular"),
    kindOccasional: t("helperForm.kindOccasional"),
    kindService: t("helperForm.kindService"),
    since: t("helperForm.since"),
    notes: t("helperForm.notes"),
    notesPlaceholder: t("helperForm.notesPlaceholder"),
    addEngagement: t("helperForm.addEngagement"),
    newTitle: t("helperForm.newTitle", { name: "{name}" }),
    newDescription: t("helperForm.newDescription"),
    adding: t("common.adding"),
    add: t("helperForm.add"),
    editEngagement: t("helperForm.editEngagement"),
    removeEngagement: t("helperForm.removeEngagement"),
    editTitle: t("helperForm.editTitle"),
    editDescription: t("helperForm.editDescription"),
    saveChanges: t("helperForm.saveChanges"),
    removeTitle: t("helperForm.removeTitle"),
    removeDescription: t("helperForm.removeDescription", { name: "{name}" }),
    remove: t("helperForm.remove"),
    cancel: t("helperForm.cancel"),
  };
}

/** The backup-service sheets' words in the viewer's language (story 22-004). */
export function backupServiceFormLabels(t: Translate): BackupServiceFormLabels {
  return {
    name: t("helperForm.serviceName"),
    namePlaceholder: t("helperForm.serviceNamePlaceholder"),
    contact: t("helperForm.serviceContact"),
    covers: t("helperForm.serviceCovers"),
    coversNone: t("helperForm.serviceCoversNone"),
    notes: t("helperForm.notes"),
    notesPlaceholder: t("helperForm.serviceNotesPlaceholder"),
    addService: t("helperForm.addService"),
    serviceTitle: t("helperForm.serviceTitle"),
    serviceDescription: t("helperForm.serviceDescription"),
    adding: t("common.adding"),
    add: t("helperForm.add"),
    // `{name}` is filled in by the sheet with the service's own name.
    editService: t("helperForm.editService", { name: "{name}" }),
    editServiceDescription: t("helperForm.editServiceDescription"),
    saving: t("common.saving"),
    saveChanges: t("helperForm.saveChanges"),
    retireService: t("helperForm.retireService", { name: "{name}" }),
    restoreService: t("helperForm.restoreService", { name: "{name}" }),
    retireTitle: t("helperForm.retireTitle", { name: "{name}" }),
    retireDescription: t("helperForm.retireDescription"),
    retire: t("helperForm.retire"),
    cancel: t("helperForm.cancel"),
    whichService: t("helperForm.whichService"),
    arranging: t("helperForm.arranging"),
    arrangeNamed: t("helperForm.arrangeNamed", { name: "{name}" }),
    arrange: t("helperForm.arrange"),
  };
}
