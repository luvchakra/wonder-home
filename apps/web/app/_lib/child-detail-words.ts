import { ACTIVITY_KINDS } from "@wonderhome/core/school/activities";
import type { Translate, TranslationKey } from "@wonderhome/core/i18n/translate";

import type { ChildDetailWords } from "../school/child-details";
import type { SchoolWeekWords } from "../school/school-week-sheets";
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
      kinds: { competition: t("school.notes.kind.competition"), exam: t("school.notes.kind.exam"), event: t("school.notes.kind.event"), award: t("school.notes.kind.award"), note: t("school.notes.kind.note") },
      title: t("school.notes.title"),
      titlePlaceholder: t("school.notes.titlePlaceholder"),
      onDate: t("school.notes.onDate"),
      startsAt: t("school.notes.startsAt"),
      endsAt: t("school.notes.endsAt"),
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

/** The keys the app's own exam types show under, in the reader's language (08-015); the stored name stays English. */
const EXAM_TYPE_KEYS: Record<string, TranslationKey> = { "Unit test": "school.exams.types.unitTest", "Mid-term": "school.exams.types.midTerm", Finals: "school.exams.types.finals" };

/** A child's timetable and exams words (08-015), resolved on the server, with the household's own exam types. */
export function schoolWeekWords(t: Translate, language: string, examTypes: { builtIn: readonly string[]; own: readonly { name: string }[] }): SchoolWeekWords {
  const types = [...examTypes.builtIn, ...examTypes.own.map((type) => type.name)];
  return {
    saving: t("common.saving"),
    addNew: t("grocery.picker.addNew"),
    chooseExisting: t("grocery.picker.chooseExisting"),
    dayNames: weekdayNames(language),
    subjects: t("school.teachers.subjects")
      .split("|")
      .map((word) => word.trim())
      .filter(Boolean),
    timetable: {
      add: t("school.timetable.add"),
      sheetAdd: t("school.timetable.sheetAdd", KEEP),
      sheetEdit: t("school.timetable.sheetEdit", KEEP),
      edit: t("school.timetable.edit", KEEP),
      remove: t("school.timetable.remove", KEEP),
      day: t("school.timetable.day"),
      subject: t("school.timetable.subject"),
      startsAt: t("school.timetable.startsAt"),
      endsAt: t("school.timetable.endsAt"),
      teacher: t("school.timetable.teacher"),
      noTeacher: t("school.timetable.noTeacher"),
      room: t("school.timetable.room"),
      save: t("school.timetable.save"),
    },
    exams: {
      add: t("school.exams.add"),
      sheetAdd: t("school.exams.sheetAdd", KEEP),
      sheetEdit: t("school.exams.sheetEdit", KEEP),
      edit: t("school.exams.edit", KEEP),
      remove: t("school.exams.remove", KEEP),
      type: t("school.exams.type"),
      types,
      typeLabels: Object.fromEntries(types.map((name) => [name, EXAM_TYPE_KEYS[name] ? t(EXAM_TYPE_KEYS[name]!) : name])),
      titleField: t("school.exams.titleField"),
      titlePlaceholder: t("school.exams.titlePlaceholder"),
      notes: t("school.exams.notes"),
      save: t("school.exams.save"),
      calendarHint: t("school.exams.calendarHint"),
    },
    paper: {
      add: t("school.exams.paper.add"),
      sheetAdd: t("school.exams.paper.sheetAdd", KEEP),
      sheetEdit: t("school.exams.paper.sheetEdit", KEEP),
      edit: t("school.exams.paper.edit", KEEP),
      remove: t("school.exams.paper.remove", KEEP),
      subject: t("school.exams.paper.subject"),
      onDate: t("school.exams.paper.onDate"),
      startsAt: t("school.exams.paper.startsAt"),
      endsAt: t("school.exams.paper.endsAt"),
      syllabus: t("school.exams.paper.syllabus"),
      syllabusPlaceholder: t("school.exams.paper.syllabusPlaceholder"),
      links: t("school.exams.paper.links"),
      linksHint: t("school.exams.paper.linksHint"),
      save: t("school.exams.paper.save"),
    },
  };
}
