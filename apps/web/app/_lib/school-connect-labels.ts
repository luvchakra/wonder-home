import type { Translate } from "@wonderhome/core/i18n/translate";

/** Every string the redesigned Connect-school screen needs, translated on the server. */
export type SchoolConnectLabels = {
  forwardTitle: string;
  forwardBody: string;
  forwardCta: string;
  availableNow: string;
  portalTitle: string;
  portalLede: string;
  portalNone: string;
  portalManage: string;
};

export function schoolConnectLabels(t: Translate): SchoolConnectLabels {
  return {
    forwardTitle: t("school.connect.forward.title"),
    forwardBody: t("school.connect.forward.body"),
    forwardCta: t("school.connect.forward.cta"),
    availableNow: t("school.connect.availableNow"),
    portalTitle: t("school.connect.conns.title"),
    portalLede: t("school.connect.conns.lede"),
    portalNone: t("school.connect.conns.none"),
    portalManage: t("school.connect.conns.manage"),
  };
}
