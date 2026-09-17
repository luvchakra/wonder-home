import { AppShell } from "@wonderhome/core/shell/app-shell";

import { AreaPlaceholder } from "../_components/area-placeholder";

export const metadata = { title: "More" };

export default function MorePage() {
  return (
    <AppShell active="more">
      <AreaPlaceholder
        title="More"
        lede="Household modules, admin controls and settings."
        nextUp="Manage Household, certification and the domain modules attach here as their backlogs land."
      />
    </AppShell>
  );
}
