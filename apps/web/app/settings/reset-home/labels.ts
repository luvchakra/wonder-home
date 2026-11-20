import type { DownloadedLabels, DownloadLabels, ResetLabels, StepUpLabels } from "./reset-forms";
import { RESET_ERROR_CODES, type ResetErrorCode } from "./reset-state";

import type { Translate as T, TranslationKey } from "@wonderhome/core/i18n/translate";

/** The words the reset screen's client pieces show, read on the server (nothing server-only reaches the browser). */
export function stepUpLabels(t: T): StepUpLabels {
  return {
    password: t("resetHome.password.label"),
    passwordHint: t("resetHome.password.hint"),
    googleBody: t("resetHome.google.body"),
    googleButton: t("resetHome.google.button"),
    googleOpening: t("resetHome.google.opening"),
    googleFresh: t("resetHome.google.fresh", { time: "{time}" }),
  };
}

export function downloadLabels(t: T): DownloadLabels {
  return {
    ...stepUpLabels(t),
    button: t("resetHome.download.button"),
    preparing: t("resetHome.download.preparing"),
    done: t("resetHome.download.done", { time: "{time}" }),
    error: t("resetHome.download.error"),
    healthLede: t("resetHome.health.lede"),
    healthPassword: t("resetHome.health.password"),
    healthRepeat: t("resetHome.health.repeat"),
    healthHint: t("resetHome.health.hint", { min: 12 }),
    healthTooShort: t("resetHome.health.tooShort", { min: 12 }),
    healthTooLong: t("resetHome.health.tooLong"),
    healthMismatch: t("resetHome.health.mismatch"),
  };
}

export function downloadedLabels(t: T): DownloadedLabels {
  return { yes: t("resetHome.step1.downloadedYes", { time: "{time}" }), no: t("resetHome.step1.downloadedNo") };
}

export function resetLabels(t: T, household: string): ResetLabels {
  return {
    ...stepUpLabels(t),
    name: t("resetHome.name.label", { household }),
    nameHint: t("resetHome.name.hint"),
    submit: t("resetHome.submit"),
    submitting: t("resetHome.submitting"),
    errors: Object.fromEntries(RESET_ERROR_CODES.map((code) => [code, t(`resetHome.error.${code}` as TranslationKey)])) as Record<ResetErrorCode, string>,
  };
}
