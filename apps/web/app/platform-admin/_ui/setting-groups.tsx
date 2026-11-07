import { Alert } from "@wonderhome/core/ui/alert";

import { Panel } from "./page-title";
import { SettingRow, type SettingRowView } from "./setting-row";

/** Each group of settings as a panel of rows. */
export function SettingGroups({ groups, storeReady }: { groups: { group: string; label: string; rows: SettingRowView[] }[]; storeReady: boolean }) {
  return (
    <div className="space-y-4">
      {storeReady ? null : (
        <Alert tone="attention">The settings store isn&rsquo;t reachable just now, so everything below shows what Vercel has. Saving will work once it is back.</Alert>
      )}
      {groups.map((group) => (
        <Panel key={group.group} title={group.label} id={`group-${group.group}`}>
          <ul>
            {group.rows.map((row) => (
              <SettingRow key={row.key} view={row} />
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
