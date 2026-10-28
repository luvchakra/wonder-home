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
  choose: string;
  connect: string;
  connectedBadge: string;
  connectOk: string;
  fetchTitle: string;
  fetchLede: string;
  fetchNow: string;
  fetchOk: string;
  pollChecking: string;
  pollFailed: string;
  pollSlow: string;
  reconnectNeeded: string;
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
    choose: t("school.connect.conns.choose"),
    connect: t("school.connect.connect"),
    connectedBadge: t("school.connect.connectedBadge"),
    connectOk: t("school.connect.poll.okTest"),
    fetchTitle: t("school.connect.fetch.title"),
    fetchLede: t("school.connect.fetch.lede"),
    fetchNow: t("school.connect.fetch.now"),
    fetchOk: t("school.connect.poll.okFetch"),
    pollChecking: t("school.connect.poll.checking"),
    pollFailed: t("school.connect.poll.failed"),
    pollSlow: t("school.connect.poll.slow"),
    reconnectNeeded: t("school.connect.reconnect.needed"),
  };
}
