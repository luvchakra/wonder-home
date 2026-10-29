import type { Translate } from "@wonderhome/core/i18n/translate";

import type { ProviderCardLabels } from "../_components/provider-card";

/** The status words a connection card's badge uses, in the reader's language. */
export function providerCardLabels(t: Translate): ProviderCardLabels {
  return {
    connected: t("manage.integrations.connected"),
    connecting: t("manage.integrations.status.connecting"),
    notConnected: t("manage.integrations.notConnected"),
    notConfigured: t("manage.integrations.notConfigured"),
    managed: t("manage.integrations.setUpByAdmin"),
  };
}
