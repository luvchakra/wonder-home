import "server-only";

import type { HomeSendItem } from "@wonderhome/core/homesend/items";
import type { WaitEvidence, WaitWhy } from "@wonderhome/core/homesend/waiting";
import type { Translate } from "@wonderhome/core/i18n/translate";

import type { ReviewPreparation } from "../(auth)/home-send-review";

/** The evidence a prepared review already holds, in the shape `waiting.ts` reads. Nothing new is worked out here. */
export function waitEvidence(item: Pick<HomeSendItem, "classifiedKind" | "extracted" | "understanding" | "createdByMemberId">, review: ReviewPreparation): WaitEvidence {
  return {
    kind: item.classifiedKind,
    extracted: item.extracted,
    understanding: review.understanding ?? item.understanding,
    reconciliation: review.reconciliation,
    confirmation: review.confirmation,
    plan: Boolean(review.plan),
    memberInitiated: item.createdByMemberId !== null,
  };
}

/** "Why it waits", in a few words in the viewer's language — never an amount, never what the item says beyond a matched title. */
export function whyWords(why: WaitWhy, t: Translate): string {
  switch (why.code) {
    case "on_list":
      return t("homesend.inbox.wait.onList");
    case "approval":
      return t(why.area === "school" ? "homesend.inbox.wait.approvalSchool" : "homesend.inbox.wait.approvalGroceries");
    case "below_bar":
      return t("homesend.inbox.wait.belowBar", { percent: why.percent });
    case "duplicate":
      return t("homesend.why.duplicate", { title: why.title });
    case "update":
      return t("homesend.why.update", { title: why.title });
    case "by_email":
      return t("homesend.why.byEmail");
    default:
      return t(`homesend.why.${why.code}` as "homesend.why.photo");
  }
}
