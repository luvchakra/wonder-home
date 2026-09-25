import type { CertificationItem } from "@wonderhome/core/household/certification";
import type { Translate } from "@wonderhome/core/i18n/translate";
import type { CertificationItemLabels } from "@wonderhome/core/ui/certification-item";

import type { CertificationControlLabels } from "../_components/certification-controls";

/**
 * HomeBrain Review's words in the viewer's language (story 22-004). What
 * WonderHome believes — each claim — is the household's own sentence and is
 * never translated; only the words around it are.
 */

export function reviewCategoryWords(category: CertificationItem["category"], t: Translate): string {
  return t(`review.category.${category}`);
}

/** Why a belief needs a look, from the same facts `alertsFor` reads (its English `reason` is the record). */
export function reviewReason(item: CertificationItem, now: Date, t: Translate): string {
  if (item.status === "needs_review") return t("review.reason.contradicts");
  if (!item.lastReviewedAt) return t("review.reason.neverChecked", { source: t(`review.reasonSource.${item.sourceType}`) });
  const ageDays = Math.floor((now.getTime() - item.lastReviewedAt.getTime()) / 86_400_000);
  return t("review.reason.lastChecked", { count: ageDays });
}

export function certificationItemLabels(t: Translate): CertificationItemLabels {
  return {
    from: t("review.item.from", { source: "{source}", category: "{category}" }),
    source: t("review.item.source"),
    category: t("review.item.category"),
    learned: t("review.item.learned"),
    confidence: t("review.item.confidence"),
    matters: t("review.item.matters"),
    lastChecked: t("review.item.lastChecked"),
    never: t("review.item.never"),
    status: {
      confirmed: t("review.status.confirmed"),
      learned: t("review.status.learned"),
      needs_review: t("review.status.needs_review"),
      corrected: t("review.status.corrected"),
      removed: t("review.status.removed"),
    },
    risk: {
      low: t("review.risk.low"),
      medium: t("review.risk.medium"),
      high: t("review.risk.high"),
      critical: t("review.risk.critical"),
    },
  };
}

export function certificationControlLabels(t: Translate): CertificationControlLabels {
  return {
    add: t("review.add"),
    addLede: t("review.addLede"),
    claim: t("review.addClaim"),
    claimPlaceholder: t("review.addClaimPlaceholder"),
    category: t("review.addCategory"),
    categories: {
      family_roles: t("review.category.family_roles"),
      home_routines: t("review.category.home_routines"),
      education: t("review.category.education"),
      finance: t("review.category.finance"),
      lifestyle: t("review.category.lifestyle"),
      safety: t("review.category.safety"),
    },
    adding: t("common.adding"),
    submit: t("review.addSubmit"),
    decisions: {
      confirmed: t("review.control.confirmed"),
      removed: t("review.control.removed"),
      deferred: t("review.control.deferred"),
    },
    correct: t("review.control.correct"),
    correction: t("review.control.correction"),
    correctionPlaceholder: t("review.control.correctionPlaceholder"),
  };
}
