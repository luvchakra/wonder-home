import type { Translate } from "@wonderhome/core/i18n/translate";

/** Every string the Connect-school screen's client parts need, translated on the server. */
export type SchoolConnectLabels = {
  forwardTitle: string;
  forwardBody: string;
  forwardCta: string;
  availableNow: string;
  setupNeeded: string;
  notLiveNote: string;
  portals: string;
  portalsLede: string;
  connect: string;
  disconnect: string;
  connectedBadge: string;
  visitPortal: string;
  channelsTitle: string;
  channelsLede: string;
  channelUrlLabel: string;
  channelForChild: string;
  channelAnyChild: string;
  channelAdd: string;
  channelStop: string;
  channelResume: string;
  channelNone: string;
  channelStoppedBadge: string;
};

export function schoolConnectLabels(t: Translate): SchoolConnectLabels {
  return {
    forwardTitle: t("school.connect.forward.title"),
    forwardBody: t("school.connect.forward.body"),
    forwardCta: t("school.connect.forward.cta"),
    availableNow: t("school.connect.availableNow"),
    setupNeeded: t("school.connect.setupNeeded"),
    notLiveNote: t("school.connect.notLiveNote"),
    portals: t("school.connect.portals"),
    portalsLede: t("school.connect.portalsLede"),
    connect: t("school.connect.connect"),
    disconnect: t("school.connect.disconnect"),
    connectedBadge: t("school.connect.connectedBadge"),
    visitPortal: t("school.connect.visitPortal"),
    channelsTitle: t("school.connect.channels.title"),
    channelsLede: t("school.connect.channels.lede"),
    channelUrlLabel: t("school.connect.channels.urlLabel"),
    channelForChild: t("school.connect.channels.forChild"),
    channelAnyChild: t("school.connect.channels.anyChild"),
    channelAdd: t("school.connect.channels.add"),
    channelStop: t("school.connect.channels.stop"),
    channelResume: t("school.connect.channels.resume"),
    channelNone: t("school.connect.channels.none"),
    channelStoppedBadge: t("school.connect.channels.stopped"),
  };
}
