import { Mail } from "lucide-react";

import { getHomeSendAddress, platformHomeSendEmailDomain } from "@wonderhome/core/homesend/addresses";
import { loadEmailAllowlist } from "@wonderhome/core/homesend/email-allowlist";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { listIntegrations } from "@wonderhome/core/integrations/repository";

import { EmailConnection, type EmailConnectionLabels } from "../../_components/email-connection";
import { ProviderCard } from "../../_components/provider-card";
import { providerCardLabels } from "../../_lib/connection-card-labels";
import { connectionCardShape } from "../../_lib/connection-cards";
import { formatDate, type Session } from "../../_lib/session";

/** The Email connection's words in the viewer's language. */
function emailConnectionLabels(t: Translate): EmailConnectionLabels {
  return {
    address: {
      heading: t("connectionsPage.email.address.heading"),
      explain: t("connectionsPage.email.address.explain"),
      off: t("connectionsPage.email.address.off"),
      revoked: t("connectionsPage.email.address.revoked"),
      setUp: t("connectionsPage.email.address.setUp"),
      turnBackOn: t("connectionsPage.email.address.turnBackOn"),
      newAddress: t("connectionsPage.email.address.newAddress"),
      turnOff: t("connectionsPage.email.address.turnOff"),
      working: t("connectionsPage.email.address.working"),
    },
    copy: t("connectionsPage.email.copy"),
    copied: t("connectionsPage.email.copied"),
    copyAria: t("connectionsPage.email.copyAria"),
    allow: {
      heading: t("connectionsPage.email.allow.heading"),
      explain: t("connectionsPage.email.allow.explain"),
      empty: t("connectionsPage.email.allow.empty"),
      placeholder: t("connectionsPage.email.allow.placeholder"),
      add: t("connectionsPage.email.allow.add"),
      adding: t("connectionsPage.email.allow.adding"),
      remove: t("connectionsPage.email.allow.remove"),
      removeAria: t("connectionsPage.email.allow.removeAria"),
      addressBadge: t("connectionsPage.email.allow.addressBadge"),
      domainBadge: t("connectionsPage.email.allow.domainBadge"),
    },
    rules: {
      heading: t("connectionsPage.email.rules.heading"),
      neverSignIn: t("connectionsPage.email.rules.neverSignIn"),
      onlyApproved: t("connectionsPage.email.rules.onlyApproved"),
      spoof: t("connectionsPage.email.rules.spoof"),
      alwaysWait: t("connectionsPage.email.rules.alwaysWait"),
    },
    oauthNote: t("connectionsPage.email.oauthNote"),
  };
}

/**
 * Email as a connection card (owner, 2026-10-29). One chevron card: collapsed,
 * its status; expanded, the forwarding address and the approved-sender
 * allowlist — the one gate that decides what WonderHome ever reads (story
 * 17-016). Admin-only: the page gates this card behind `integrations.manage`.
 *
 * Until the deployment has an email domain (`WONDERHOME_HOMESEND_EMAIL_DOMAIN`)
 * the card says it isn't set up rather than offering controls with nothing
 * behind them (the external-providers rule).
 */
export async function EmailSection({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const configured = platformHomeSendEmailDomain() !== null;

  const [integrations, address, entries] = await Promise.all([
    listIntegrations(supabase, householdId).catch(() => []),
    configured ? getHomeSendAddress(supabase, householdId).catch(() => null) : Promise.resolve(null),
    configured ? loadEmailAllowlist(supabase, householdId).catch(() => []) : Promise.resolve([]),
  ]);
  const email = integrations.filter((integration) => integration.kind === "email");
  const best = email.find((integration) => integration.status === "connected") ?? email[0] ?? null;
  const shape = connectionCardShape({ deploymentLevel: false, configured, connectionStatus: best?.status ?? null });

  return (
    <ProviderCard
      id="email"
      icon={Mail}
      tone="home"
      name={t("manage.integrations.kind.email")}
      purpose={t("manage.integrations.purpose.email")}
      status={shape.status}
      connectable={shape.connectable}
      labels={providerCardLabels(t)}
    >
      {best ? (
        <p className="text-xs text-[var(--wh-foreground-subtle)]">
          {best.provider} ·{" "}
          {best.lastSuccessAt
            ? t("manage.integrations.lastSynced", { date: formatDate(timezone, best.lastSuccessAt, "long") })
            : t("manage.integrations.neverSynced")}
        </p>
      ) : null}
      {configured ? (
        <EmailConnection
          householdId={householdId}
          household={membership.household.name}
          address={address}
          entries={entries}
          labels={emailConnectionLabels(t)}
        />
      ) : (
        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("connectionsPage.email.notConfigured")}</p>
      )}
    </ProviderCard>
  );
}
