import { Alert } from "@wonderhome/core/ui/alert";

import type { ConfigurationGap } from "@wonderhome/core/platform/settings/health";

/** "Configuration health": each required setting that is missing, and what it stops. Nothing when all is well. */
export function ConfigurationHealth({ gaps }: { gaps: readonly ConfigurationGap[] }) {
  if (gaps.length === 0) return null;
  return (
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
  );
}
