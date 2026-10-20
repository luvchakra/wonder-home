import { BellRing } from "lucide-react";

import { createAdminClient } from "@wonderhome/core/db/admin";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { loadDeliveryReport } from "@wonderhome/core/notifications/delivery-report";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { requireSession } from "../../_lib/session";

export const metadata = { title: "Notification delivery" };
export const dynamic = "force-dynamic";

const KNOWN_REASONS = ["unavailable", "rejected", "no_target", "not_configured", "gone"];

/**
 * Whether notifications are reaching people (story 27-010): per channel, over
 * the last week, what was sent, what did not arrive and why, and what is
 * waiting for another try. Counts only, for the household's Admins; the
 * individual messages and addresses are nobody else's to see.
 */
export default async function DeliveryPage() {
  const session = await requireSession("/household/delivery");
  const { membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/household/delivery",
    back: { href: "/household", label: t("manage.backToManage") },
    title: t("manage.section.delivery"),
  };

  if (!view.permissions.includes("household.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={BellRing} title={t("manage.forAdmins")} description={t("manage.section.deliveryMeta")} />
      </AppShell>
    );
  }

  const report = await loadDeliveryReport(createAdminClient(), membership.household.id).catch(() => null);
  const anyFailed = report?.channels.some((channel) => channel.failed > 0) ?? false;
  const anySent = report?.channels.some((channel) => channel.sent > 0) ?? false;

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("manage.section.delivery")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.lede", { days: report?.days ?? 7 })}</p>
        </header>

        {report?.channels.map((channel) => {
          const empty = channel.sent === 0 && channel.failed === 0;
          return (
            <Card key={channel.channel} className="space-y-2">
              <div className="flex items-start gap-3">
                <IconTile icon={BellRing} tone="attention" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">{t(`settingsPage.notifications.channel.${channel.channel}` as TranslationKey)}</h2>
                  {empty ? (
                    <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.none", { days: report.days })}</p>
                  ) : (
                    <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
                      {t("manage.delivery.sent", { count: channel.sent })}
                      {channel.failed > 0 ? ` · ${t("manage.delivery.failed", { count: channel.failed })}` : ""}
                      {channel.recovered > 0 ? ` · ${t("manage.delivery.recovered", { count: channel.recovered })}` : ""}
                    </p>
                  )}
                </div>
              </div>
              {channel.failed > 0 ? (
                <ul className="list-disc space-y-1 ps-12 text-sm text-[var(--wh-foreground-muted)]">
                  {Object.entries(channel.reasons).map(([code, count]) => (
                    <li key={code}>
                      {t("manage.delivery.reasonLine", { count, reason: t(`manage.delivery.reason.${KNOWN_REASONS.includes(code) ? code : "unknown"}` as TranslationKey) })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          );
        })}

        {report && (report.retriesWaiting > 0 || report.retriesGivenUp > 0) ? (
          <Card className="space-y-1 text-sm text-[var(--wh-foreground-muted)]">
            {report.retriesWaiting > 0 ? <p>{t("manage.delivery.waiting", { count: report.retriesWaiting })}</p> : null}
            {report.retriesGivenUp > 0 ? <p>{t("manage.delivery.gaveUp", { count: report.retriesGivenUp })}</p> : null}
          </Card>
        ) : null}
        {report && anySent && !anyFailed ? <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.allWell", { days: report.days })}</p> : null}
        {report?.truncated ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("manage.delivery.truncated")}</p> : null}

        <QuoteCard>{t("manage.delivery.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
