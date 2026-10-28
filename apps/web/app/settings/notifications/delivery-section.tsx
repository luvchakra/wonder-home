import { BellRing } from "lucide-react";

import { createAdminClient } from "@wonderhome/core/db/admin";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { loadDeliveryReport } from "@wonderhome/core/notifications/delivery-report";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { Session } from "../../_lib/session";

const KNOWN_REASONS = ["unavailable", "rejected", "no_target", "not_configured", "gone"];

/**
 * Whether notifications are reaching people (story 27-010): per channel, over
 * the last week, what was sent, what did not arrive and why, and what is
 * waiting for another try. Counts only, for the household's Admins; the page
 * renders this only for one. Folded into Settings → Notifications
 * (design/UI-SIMPLIFICATION-v1.md M1) as one row that opens to the counts;
 * the row itself says when something did not arrive.
 */
export async function DeliverySection({ session }: { session: Session }) {
  const { membership, locale } = session;
  const { t } = locale;
  const report = await loadDeliveryReport(createAdminClient(), membership.household.id).catch(() => null);
  const anyFailed = report?.channels.some((channel) => channel.failed > 0) ?? false;
  const anySent = report?.channels.some((channel) => channel.sent > 0) ?? false;

  return (
    <section id="delivery" className="scroll-mt-20">
      <Card className="p-2">
        <ExpandableRow
          summary={
            <>
              <IconTile icon={BellRing} tone="attention" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t("manage.section.delivery")}</span>
                <span className="block text-sm text-[var(--wh-foreground-muted)]">
                  {anyFailed
                    ? t("manage.delivery.failed", { count: report?.channels.reduce((sum, channel) => sum + channel.failed, 0) ?? 0 })
                    : t("manage.delivery.lede", { days: report?.days ?? 7 })}
                </span>
              </span>
            </>
          }
        >
          <div className="space-y-3 px-2 pb-2">
            {anyFailed ? <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.lede", { days: report?.days ?? 7 })}</p> : null}
            {report?.channels.map((channel) => {
              const empty = channel.sent === 0 && channel.failed === 0;
              return (
                <div key={channel.channel} className="space-y-1">
                  <h3 className="text-sm font-semibold">{t(`settingsPage.notifications.channel.${channel.channel}` as TranslationKey)}</h3>
                  {empty ? (
                    <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.none", { days: report.days })}</p>
                  ) : (
                    <p className="text-sm text-[var(--wh-foreground-muted)]">
                      {t("manage.delivery.sent", { count: channel.sent })}
                      {channel.failed > 0 ? ` · ${t("manage.delivery.failed", { count: channel.failed })}` : ""}
                      {channel.recovered > 0 ? ` · ${t("manage.delivery.recovered", { count: channel.recovered })}` : ""}
                    </p>
                  )}
                  {channel.failed > 0 ? (
                    <ul className="list-disc space-y-1 ps-5 text-sm text-[var(--wh-foreground-muted)]">
                      {Object.entries(channel.reasons).map(([code, count]) => (
                        <li key={code}>
                          {t("manage.delivery.reasonLine", { count, reason: t(`manage.delivery.reason.${KNOWN_REASONS.includes(code) ? code : "unknown"}` as TranslationKey) })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}

            {report && report.retriesWaiting > 0 ? <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.waiting", { count: report.retriesWaiting })}</p> : null}
            {report && report.retriesGivenUp > 0 ? <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.gaveUp", { count: report.retriesGivenUp })}</p> : null}
            {report && anySent && !anyFailed ? <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.delivery.allWell", { days: report.days })}</p> : null}
            {report?.truncated ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("manage.delivery.truncated")}</p> : null}
          </div>
        </ExpandableRow>
      </Card>
    </section>
  );
}
