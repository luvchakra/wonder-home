import { listSubscriptions } from "@wonderhome/core/calendar/subscriptions/repository";

import { CalendarSubscriptionsManager, type CalSubLabels, type SubscriptionView } from "../../_components/calendar-subscriptions-manager";
import type { Session } from "../../_lib/session";

/**
 * The ICS calendar-subscriptions manager, rendered in the Calendar connection
 * card's detail slot (story 26-022; the card is `calendar-section.tsx`, owned by
 * the per-connection redesign #444). This is the subscribe-by-link feature —
 * the real event details, read-only — kept visually distinct from the Calendar
 * card's free/busy integration status above it. Adults only.
 */
export async function CalendarSubscriptionsSlot({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  if (membership.memberType !== "adult") return null;

  const subscriptions = await listSubscriptions(supabase, membership.household.id).catch(() => []);
  const views: SubscriptionView[] = subscriptions.map((sub) => ({
    id: sub.id,
    name: sub.name,
    visibility: sub.visibility,
    status: sub.status,
    synced: sub.lastSyncAt !== null,
  }));

  const labels: CalSubLabels = {
    add: t("connectionsPage.cal.add"),
    name: t("connectionsPage.cal.name"),
    namePlaceholder: t("connectionsPage.cal.namePlaceholder"),
    link: t("connectionsPage.cal.link"),
    linkPlaceholder: t("connectionsPage.cal.linkPlaceholder"),
    linkHint: t("connectionsPage.cal.linkHint"),
    visibility: t("connectionsPage.cal.visibility"),
    visHousehold: t("connectionsPage.cal.visHousehold"),
    visPrivate: t("connectionsPage.cal.visPrivate"),
    create: t("connectionsPage.cal.create"),
    cancel: t("connectionsPage.cal.cancel"),
    refresh: t("connectionsPage.cal.refresh"),
    remove: t("connectionsPage.cal.remove"),
    removeConfirm: t("connectionsPage.cal.removeConfirm"),
    empty: t("connectionsPage.cal.empty"),
    readonly: t("connectionsPage.cal.readonly"),
    synced: t("connectionsPage.cal.synced"),
    never: t("connectionsPage.cal.never"),
    failed: t("connectionsPage.cal.failed"),
  };

  return (
    <div className="space-y-2 border-t border-[var(--wh-border)] pt-3">
      <p className="text-sm font-medium">{t("connectionsPage.cal.title")}</p>
      <p className="text-xs text-[var(--wh-foreground-muted)]">{t("connectionsPage.cal.lede")}</p>
      <CalendarSubscriptionsManager householdId={membership.household.id} subscriptions={views} labels={labels} />
    </div>
  );
}
