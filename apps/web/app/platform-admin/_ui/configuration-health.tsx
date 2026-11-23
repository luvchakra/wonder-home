import { Alert } from "@wonderhome/core/ui/alert";

import type { DeliveryClockStatus } from "@wonderhome/core/jobs/delivery-clock-status";
import type { ConfigurationGap } from "@wonderhome/core/platform/settings/health";

/**
 * "Configuration health": each required setting that is missing, and what it stops, with the delivery clock's
 * state. A failing clock joins the list; "not set" and "running" are one quiet line.
 */
export function ConfigurationHealth({
  gaps: settingGaps,
  clock = null,
  scheduler = null,
}: {
  gaps: readonly ConfigurationGap[];
  clock?: DeliveryClockStatus | null;
  scheduler?: string | null;
}) {
  const gaps = clock?.state === "failing" ? [...settingGaps, { key: "GITHUB_DISPATCH_TOKEN", words: clock.words }] : settingGaps;
  const lines = [
    ...(scheduler ? [{ key: "CRON_SECRET", words: scheduler }] : []),
    ...(clock && clock.state !== "failing" ? [{ key: "GITHUB_DISPATCH_TOKEN", words: clock.words }] : []),
  ];
  const quiet =
    lines.length > 0 ? (
      <ul className="space-y-1 text-sm text-[var(--wh-foreground-muted)]">
        {lines.map((line) => (
          <li key={line.key}>
            <a href={`/platform-admin/integrations#setting-${line.key}`} className="hover:underline">{line.words}</a>
          </li>
        ))}
      </ul>
    ) : null;
  if (gaps.length === 0) return quiet;
  return (
    <>
    {quiet}
    <Alert tone="risk">
      <p className="font-semibold">Configuration health</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {gaps.map((gap) => (
          <li key={gap.key}>
            <a href={`/platform-admin/integrations#setting-${gap.key}`} className="hover:underline">{gap.words}</a>
          </li>
        ))}
      </ul>
    </Alert>
    </>
  );
}
