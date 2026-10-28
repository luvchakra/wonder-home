import type { Translate } from "@wonderhome/core/i18n/translate";

/** Every string the Connections manager (a client component) needs, translated on the server. */
export type ConnectionsLabels = {
  none: string;
  newConnection: string;
  chooseType: string;
  nameLabel: string;
  namePlaceholder: string;
  create: string;
  cancel: string;
  edit: string;
  save: string;
  remove: string;
  keepSecret: string;
  linkHint: string;
  /** Status slug → words. */
  status: Record<string, string>;
  // Browser-automation fetch (Test connection + pages to read).
  testConnection: string;
  testChecking: string;
  testOk: string;
  testFailed: string;
  testSlow: string;
  reconnectNeeded: string;
  pagesTitle: string;
  pagesLede: string;
  pagesNone: string;
  pageUrlLabel: string;
  pageKindLabel: string;
  pageForChild: string;
  pageAnyone: string;
  pageAdd: string;
  pageStop: string;
  pageResume: string;
  pageStopped: string;
  /** Kind slug → words. */
  pageKind: Record<string, string>;
};

export function connectionsLabels(t: Translate): ConnectionsLabels {
  return {
    none: t("manage.connections.none"),
    newConnection: t("manage.connections.new"),
    chooseType: t("manage.connections.chooseType"),
    nameLabel: t("manage.connections.nameLabel"),
    namePlaceholder: t("manage.connections.namePlaceholder"),
    create: t("manage.connections.create"),
    cancel: t("manage.connections.cancel"),
    edit: t("manage.connections.edit"),
    save: t("manage.connections.save"),
    remove: t("manage.connections.remove"),
    keepSecret: t("manage.connections.keepSecret"),
    linkHint: t("manage.connections.linkHint"),
    status: {
      created: t("manage.connections.status.created"),
      connected: t("manage.connections.status.connected"),
      reconnect_needed: t("manage.connections.status.reconnect_needed"),
      error: t("manage.connections.status.error"),
      disconnected: t("manage.connections.status.disconnected"),
    },
    testConnection: t("manage.connections.testConnection"),
    testChecking: t("manage.connections.test.checking"),
    testOk: t("manage.connections.test.ok"),
    testFailed: t("manage.connections.test.failed"),
    testSlow: t("manage.connections.test.slow"),
    reconnectNeeded: t("manage.connections.reconnect"),
    pagesTitle: t("manage.connections.pages.title"),
    pagesLede: t("manage.connections.pages.lede"),
    pagesNone: t("manage.connections.pages.none"),
    pageUrlLabel: t("manage.connections.pages.urlLabel"),
    pageKindLabel: t("manage.connections.pages.kindLabel"),
    pageForChild: t("manage.connections.pages.forChild"),
    pageAnyone: t("manage.connections.pages.anyone"),
    pageAdd: t("manage.connections.pages.add"),
    pageStop: t("manage.connections.pages.stop"),
    pageResume: t("manage.connections.pages.resume"),
    pageStopped: t("manage.connections.pages.stopped"),
    pageKind: {
      homework: t("manage.connections.pages.kind.homework"),
      calendar: t("manage.connections.pages.kind.calendar"),
      messages: t("manage.connections.pages.kind.messages"),
      results: t("manage.connections.pages.kind.results"),
      generic: t("manage.connections.pages.kind.generic"),
    },
  };
}
