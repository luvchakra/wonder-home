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
  };
}
