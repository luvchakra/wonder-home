import type { Translate } from "@wonderhome/core/i18n/translate";

import type { SchoolFormLabels } from "../_components/school-forms";

/**
 * "{minutes} minutes" in every plural form `language` has, keyed by its
 * `Intl.PluralRules` category. The sheet picks one on the client for an
 * item's own minutes; `{minutes}` stays a placeholder here (the count only
 * chooses the form).
 */
function minuteForms(t: Translate, language: string): Record<string, string> {
  let rules: Intl.PluralRules;
  try {
    rules = new Intl.PluralRules(language);
  } catch {
    rules = new Intl.PluralRules("en");
  }
  const wanted = rules.resolvedOptions().pluralCategories.length;
  const forms: Record<string, string> = {};
  for (let count = 0; count <= 200 && Object.keys(forms).length < wanted; count += 1) {
    const category = rules.select(count);
    forms[category] ??= t("schoolForm.fact.minutes", { count, minutes: "{minutes}" });
  }
  forms.other ??= t("schoolForm.fact.minutes", { minutes: "{minutes}" });
  return forms;
}

/** Every Kids & School sheet's words in the viewer's language (story 22-004). */
export function schoolFormLabels(t: Translate, language: string): SchoolFormLabels {
  return {
    kinds: {
      homework: t("school.kind.homework"),
      worksheet: t("school.kind.worksheet"),
      exam: t("school.kind.exam"),
      project: t("school.kind.project"),
      event: t("school.kind.event"),
      notice: t("school.kind.notice"),
    },
    add: t("schoolForm.add"),
    title: t("schoolForm.title"),
    description: t("schoolForm.description"),
    readingPhoto: t("schoolForm.readingPhoto"),
    fromScreenshot: t("schoolForm.fromScreenshot"),
    for: t("schoolForm.for"),
    kind: t("schoolForm.kind"),
    what: t("schoolForm.what"),
    whatPlaceholder: t("schoolForm.whatPlaceholder"),
    subject: t("schoolForm.subject"),
    subjectPlaceholder: t("schoolForm.subjectPlaceholder"),
    notes: t("schoolForm.notes"),
    due: t("schoolForm.due"),
    dueOptional: t("schoolForm.dueOptional"),
    noticeHint: t("schoolForm.noticeHint"),
    minutes: t("schoolForm.minutes"),
    starts: t("schoolForm.starts"),
    allDayHint: t("schoolForm.allDayHint"),
    ends: t("schoolForm.ends"),
    submit: t("schoolForm.submit"),
    adding: t("common.adding"),
    save: t("common.save"),
    saving: t("common.saving"),
    factSubject: t("schoolForm.fact.subject"),
    factTime: t("schoolForm.fact.time"),
    factNotes: t("schoolForm.fact.notes"),
    factEstimate: t("schoolForm.fact.estimate"),
    minuteForms: minuteForms(t, language),
    language,
    remove: t("schoolForm.remove"),
    // `{name}` is filled in by the sheet with the item's own title.
    removeTitle: t("schoolForm.removeTitle", { name: "{name}" }),
    removeDescription: t("schoolForm.removeDescription"),
  };
}
