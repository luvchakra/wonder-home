import type { ReactNode } from "react";

import { Alert } from "@wonderhome/core/ui/alert";

import type { StaffStepUp } from "../../_lib/platform-step-up-rules";
import { Panel } from "./page-title";
import { SettingRow, type SettingRowView } from "./setting-row";

/**
 * Each group of settings as a panel of rows. `before` puts something at the
 * top of a group's panel (the Razorpay card in Payments); `hide` leaves out
 * rows that have their one editor elsewhere (rule 23).
 */
export function SettingGroups({
  groups,
  storeReady,
  stepUp,
  next,
  before = {},
  hide = [],
}: {
  groups: { group: string; label: string; rows: SettingRowView[] }[];
  storeReady: boolean;
  stepUp?: StaffStepUp;
  next?: string;
  before?: Partial<Record<string, ReactNode>>;
  hide?: readonly string[];
}) {
  return (
    <div className="space-y-4">
      {storeReady ? null : (
        <Alert tone="attention">The settings store isn&rsquo;t reachable just now, so everything below shows what Vercel has. Saving will work once it is back.</Alert>
      )}
      {groups.map((group) => {
        const rows = group.rows.filter((row) => !hide.includes(row.key));
        const top = before[group.group];
        if (!rows.length && !top) return null;
        return (
          <Panel key={group.group} title={group.label} id={`group-${group.group}`}>
            {top}
            {rows.length ? (
              <ul>
                {rows.map((row) => (
                  <SettingRow key={row.key} view={row} stepUp={stepUp} next={next} />
                ))}
              </ul>
            ) : null}
          </Panel>
        );
      })}
    </div>
  );
}
