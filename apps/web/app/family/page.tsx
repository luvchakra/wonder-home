import { AppShell } from "@wonderhome/core/shell/app-shell";

import { AreaPlaceholder } from "../_components/area-placeholder";

export const metadata = { title: "Family" };

export default function FamilyPage() {
  return (
    <AppShell active="family">
      <AreaPlaceholder
        title="Our Family"
        lede="Members, roles and shared family context."
        nextUp="Members and roles arrive with identity and family accounts (module 01)."
        quote="A happy family is a well-managed adventure."
      />
    </AppShell>
  );
}
