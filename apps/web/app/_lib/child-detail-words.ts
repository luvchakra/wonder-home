import { ACTIVITY_KINDS } from "@wonderhome/core/school/activities";
import type { Translate } from "@wonderhome/core/i18n/translate";

import type { ChildDetailWords } from "../school/child-details";
import { placeSearchLabels } from "./place-labels";
import { placeSearchAvailable } from "./places";

/** Placeholders the sheets fill in the browser with a child's, teacher's or class's own name. */
const KEEP = { name: "{name}" };

/** Short weekday names, Monday first, in the reader's language. */
export function weekdayNames(language: string): string[] {
  const format = new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(Date.UTC(2026, 9, 19 + index, 12))));
}

/** The child's teachers and classes words (08-010, 08-011), resolved on the server. */
export function childDetailWords(t: Translate, language: string): ChildDetailWords {
  return {
    saving: t("common.saving"),
    teacher: {
      add: t("school.teachers.add"),
      edit: t("school.teachers.edit", KEEP),
      remove: t("school.teachers.remove", KEEP),
      sheetAdd: t("school.teachers.sheetAdd", KEEP),
      sheetEdit: t("school.teachers.sheetEdit", KEEP),
      role: t("school.teachers.role"),
      roles: { class_teacher: t("school.teachers.classTeacher"), subject_teacher: t("school.teachers.subjectTeacher") },
      subject: t("school.teachers.subject"),
      subjects: t("school.teachers.subjects")
        .split("|")
        .map((word) => word.trim())
        .filter(Boolean),
      name: t("school.teachers.name"),
      contact: t("school.teachers.contact"),
      save: t("school.teachers.save"),
    },
    activity: {
      add: t("school.activities.add"),
      edit: t("school.activities.edit", KEEP),
      remove: t("school.activities.remove", KEEP),
      sheetAdd: t("school.activities.sheetAdd", KEEP),
      sheetEdit: t("school.activities.sheetEdit", KEEP),
      name: t("school.activities.name"),
      namePlaceholder: t("school.activities.namePlaceholder"),
      kind: t("school.activities.kind"),
      kinds: Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, t(`school.activities.kind.${kind}`)])),
      description: t("school.activities.description"),
      descriptionPlaceholder: t("school.activities.descriptionPlaceholder"),
      teacher: t("school.activities.teacher"),
      teacherContact: t("school.activities.teacherContact"),
      place: t("school.activities.place"),
      days: t("school.activities.days"),
      dayNames: weekdayNames(language),
      startsAt: t("school.activities.startsAt"),
      endsAt: t("school.activities.endsAt"),
      startsOn: t("school.activities.startsOn"),
      endsOn: t("school.activities.endsOn"),
      notes: t("school.activities.notes"),
      calendarHint: t("school.activities.calendarHint"),
      save: t("school.activities.save"),
    },
    note: {
      add: t("school.notes.add"),
      sheetTitle: t("school.notes.sheetTitle", KEEP),
      kind: t("school.notes.kind"),
      kinds: { competition: t("school.notes.kind.competition"), award: t("school.notes.kind.award"), note: t("school.notes.kind.note") },
      title: t("school.notes.title"),
      titlePlaceholder: t("school.notes.titlePlaceholder"),
      onDate: t("school.notes.onDate"),
      result: t("school.notes.result"),
      resultPlaceholder: t("school.notes.resultPlaceholder"),
      detail: t("school.notes.detail"),
      save: t("school.notes.save"),
      remove: t("school.notes.remove", KEEP),
    },
    addNew: t("grocery.picker.addNew"),
    chooseExisting: t("grocery.picker.chooseExisting"),
    placeSearch: placeSearchLabels(t, "place"),
    placeAvailable: placeSearchAvailable(),
  };
}
