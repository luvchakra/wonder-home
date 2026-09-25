import type { OnboardingSummary } from "@wonderhome/core/household/onboarding";
import type { SetupAssessment } from "@wonderhome/core/household/setup";
import type { Translate } from "@wonderhome/core/i18n/translate";
import type { SetupProgressLabels } from "@wonderhome/core/ui/setup-progress";

import type { OnboardingResumeLabels } from "../_components/onboarding-resume-card";

/**
 * Household setup in the reader's language (story 22-004).
 *
 * The assessment is arithmetic over the household's facts; only its words
 * change here. Each step keeps its key, link, tone and weight, and the
 * milestone follows the same thresholds as `milestoneFor`.
 */
export function milestoneWords(percent: number, t: Translate): string {
  if (percent >= 100) return t("homeScreen.milestone.full");
  if (percent >= 75) return t("homeScreen.milestone.nearly");
  if (percent >= 50) return t("homeScreen.milestone.halfway");
  if (percent >= 25) return t("homeScreen.milestone.good");
  return t("homeScreen.milestone.start");
}

export function localizeSetup(assessment: SetupAssessment, t: Translate): SetupAssessment {
  const step = <S extends SetupAssessment["steps"][number]>(entry: S): S => ({
    ...entry,
    title: t(`homeScreen.step.${entry.key}.title`) || entry.title,
    why: t(`homeScreen.step.${entry.key}.why`) || entry.why,
  });
  return {
    ...assessment,
    steps: assessment.steps.map(step),
    next: assessment.next.map(step),
    milestone: milestoneWords(assessment.percent, t),
  };
}

/** The card's own sentences, filled with this assessment's counts. */
export function setupProgressLabels(assessment: SetupAssessment, t: Translate, daysLeft?: number): SetupProgressLabels {
  return {
    title: t("homeScreen.setup.title"),
    setUp: t("manage.section.setup"),
    compactTitle: t("homeScreen.setup.compactTitle", { milestone: assessment.milestone }),
    compactMeta: assessment.next[0]
      ? t("homeScreen.setup.next", { title: assessment.next[0].title })
      : t("homeScreen.setup.doneOf", { done: assessment.done, total: assessment.total }),
    completeTitle: t("homeScreen.setup.completeTitle"),
    completeLede: t("homeScreen.setup.completeLede", { count: assessment.total }),
    progress: t("homeScreen.setup.progress", { done: assessment.done, total: assessment.total }),
    firstWeek: daysLeft !== undefined && daysLeft > 0 ? t("homeScreen.setup.firstWeek", { count: daysLeft }) : null,
    seeAll: t("homeScreen.setup.seeAll", { count: assessment.total }),
  };
}

/** Guided setup's resume row on Home. The next step's own wording comes from onboarding and stays as it is. */
export function onboardingCardLabels(summary: OnboardingSummary, t: Translate): OnboardingResumeLabels {
  return {
    ringLabel: t("homeScreen.setup.title"),
    title: t("homeScreen.setup.compactTitle", { milestone: milestoneWords(summary.percent, t) }),
    meta: summary.next ? t("homeScreen.setup.next", { title: summary.next.label }) : t("homeScreen.setup.allInPlace"),
    action: t("common.continue"),
  };
}
