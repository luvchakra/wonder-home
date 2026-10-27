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
  urlLabel: string;
  usernameLabel: string;
  passwordLabel: string;
  credentialsNote: string;
  signIn: string;
  connectedAs: string;
  fetchTitle: string;
  fetchLede: string;
  fetchNow: string;
  edit: string;
  editCancel: string;
  editSave: string;
  keepPassword: string;
  test: string;
  reconnectNeeded: string;
  pagesTitle: string;
  pagesLede: string;
  pagesNone: string;
  pageUrlLabel: string;
  pageKindLabel: string;
  pageForChild: string;
  pageAnyChild: string;
  pageAdd: string;
  pageRemove: string;
  pageStop: string;
  pageResume: string;
  pageStoppedBadge: string;
  /** Kind → human label, keyed by PortalScrapeKind (homework/calendar/messages/results/generic). */
  pageKind: Record<string, string>;
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
    urlLabel: t("school.connect.signin.url"),
    usernameLabel: t("school.connect.signin.username"),
    passwordLabel: t("school.connect.signin.password"),
    credentialsNote: t("school.connect.signin.note"),
    signIn: t("school.connect.signin.connect"),
    connectedAs: t("school.connect.signin.connectedAs"),
    fetchTitle: t("school.connect.fetch.title"),
    fetchLede: t("school.connect.fetch.lede"),
    fetchNow: t("school.connect.fetch.now"),
    edit: t("school.connect.signin.edit"),
    editCancel: t("school.connect.signin.cancel"),
    editSave: t("school.connect.signin.save"),
    keepPassword: t("school.connect.signin.keepPassword"),
    test: t("school.connect.signin.test"),
    reconnectNeeded: t("school.connect.reconnect.needed"),
    pagesTitle: t("school.connect.pages.title"),
    pagesLede: t("school.connect.pages.lede"),
    pagesNone: t("school.connect.pages.none"),
    pageUrlLabel: t("school.connect.pages.urlLabel"),
    pageKindLabel: t("school.connect.pages.kindLabel"),
    pageForChild: t("school.connect.pages.forChild"),
    pageAnyChild: t("school.connect.pages.anyChild"),
    pageAdd: t("school.connect.pages.add"),
    pageRemove: t("school.connect.pages.remove"),
    pageStop: t("school.connect.pages.stop"),
    pageResume: t("school.connect.pages.resume"),
    pageStoppedBadge: t("school.connect.pages.stopped"),
    pageKind: {
      homework: t("school.connect.pages.kind.homework"),
      calendar: t("school.connect.pages.kind.calendar"),
      messages: t("school.connect.pages.kind.messages"),
      results: t("school.connect.pages.kind.results"),
      generic: t("school.connect.pages.kind.generic"),
    },
  };
}
