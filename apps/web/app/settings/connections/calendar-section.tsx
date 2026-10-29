import { CalendarDays } from "lucide-react";

import { listIntegrations } from "@wonderhome/core/integrations/repository";

import { CalendarSubscriptionsSlot } from "./calendar-subscriptions-section";
import { ProviderCard } from "../../_components/provider-card";
import { providerCardLabels } from "../../_lib/connection-card-labels";
import { connectionCardShape } from "../../_lib/connection-cards";
import { formatDate, type Session } from "../../_lib/session";

/**
 * Calendar as a connection card (owner, 2026-10-29). One chevron card: collapsed,
 * its status; expanded, what it does and its subscription detail.
 *
 * ── SLOT ──────────────────────────────────────────────────────────────────
 * The calendar-subscriptions session (session_01R5Xz6YsajwJfvSAE48ouV6) renders
 * its ICS-subscription manager inside this card's body, at the marked slot
 * below, after this redesign merges. Until then the card shows its status and a
 * short "managed here" placeholder.
 * ────────────────────────────────────────────────────────────────────────────
 */
export async function CalendarSection({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const timezone = membership.household.timezone;

  const integrations = await listIntegrations(supabase, membership.household.id).catch(() => []);
  const calendar = integrations.filter((integration) => integration.kind === "calendar");
  const best = calendar.find((integration) => integration.status === "connected") ?? calendar[0] ?? null;
  const shape = connectionCardShape({ deploymentLevel: false, configured: true, connectionStatus: best?.status ?? null });

  return (
    <ProviderCard
      id="calendar"
      icon={CalendarDays}
      tone="people"
      name={t("manage.integrations.kind.calendar")}
      purpose={t("manage.integrations.purpose.calendar")}
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
      {/* SLOT: calendar-subscriptions session (story 26-022) renders its ICS-subscription manager here. */}
      <CalendarSubscriptionsSlot session={session} />
    </ProviderCard>
  );
}
