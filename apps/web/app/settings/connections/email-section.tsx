import { Mail } from "lucide-react";

import { listIntegrations } from "@wonderhome/core/integrations/repository";

import { ProviderCard } from "../../_components/provider-card";
import { providerCardLabels } from "../../_lib/connection-card-labels";
import { connectionCardShape } from "../../_lib/connection-cards";
import { formatDate, type Session } from "../../_lib/session";

/**
 * Email as a connection card (owner, 2026-10-29). One chevron card: collapsed,
 * its status; expanded, what it does and its allow-list detail.
 *
 * ── SLOT ──────────────────────────────────────────────────────────────────
 * The email-allowlist session (session_01R5Xz6Z4dGALJBsm1SxCcce) has a ready
 * component `EmailConnection` (apps/web/app/_components/email-connection.tsx).
 * It renders it inside this card's body, at the marked slot below, after this
 * redesign merges. Until then the card shows its status and a short
 * "managed here" placeholder.
 * ────────────────────────────────────────────────────────────────────────────
 */
export async function EmailSection({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const timezone = membership.household.timezone;

  const integrations = await listIntegrations(supabase, membership.household.id).catch(() => []);
  const email = integrations.filter((integration) => integration.kind === "email");
  const best = email.find((integration) => integration.status === "connected") ?? email[0] ?? null;
  const shape = connectionCardShape({ deploymentLevel: false, configured: true, connectionStatus: best?.status ?? null });

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
      {/* SLOT: email-allowlist session renders <EmailConnection /> here. */}
      <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.managerSoon")}</p>
    </ProviderCard>
  );
}
