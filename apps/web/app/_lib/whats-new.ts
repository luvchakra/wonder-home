import { recentEntries, WHATS_NEW } from "@wonderhome/core/help/whats-new";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import type { Translate } from "@wonderhome/core/i18n/translate";

import type { WhatsNewItem, WhatsNewLabels } from "../_components/whats-new-card";
import type { Session } from "./session";

/** The recent entries this reader may open, in their language; the card decides which they have not seen. */
export function whatsNewItems(session: Session, now: Date): WhatsNewItem[] {
  const { t } = session.locale;
  return recentEntries(WHATS_NEW, now, { isAdmin: isHouseholdAdmin(session.membership) }).map((entry) => ({
    id: entry.id,
    at: entry.at,
    icon: entry.icon,
    href: entry.href,
    title: t(`whatsNew.${entry.id}.title` as Parameters<Translate>[0]),
    body: t(`whatsNew.${entry.id}.body` as Parameters<Translate>[0]),
  }));
}

export function whatsNewLabels(t: Translate, itemCount: number): WhatsNewLabels {
  return {
    title: t("whatsNew.title"),
    lede: t("whatsNew.lede"),
    dismiss: t("whatsNew.dismiss"),
    showMore: Object.fromEntries(Array.from({ length: itemCount }, (_, index) => [index + 1, t("whatsNew.showAll", { count: index + 1 })])),
    showLess: t("whatsNew.showLess"),
  };
}
