import { notFound } from "next/navigation";

import { secretGroups } from "../../_lib/platform-settings-view";
import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle } from "../_ui/page-title";
import { SettingGroups } from "../_ui/setting-groups";

export const dynamic = "force-dynamic";
export const metadata = { title: "Secrets · Platform admin", robots: { index: false, follow: false } };

/** Every third-party key, write-only: owner only, each change confirmed with a password. */
export default async function PlatformSecretsPage() {
  const staff = await platformStaff("secrets.manage");
  if (!staff) notFound();
  const { groups, storeReady } = await secretGroups(staff);

  return (
    <PageBody>
      <PageTitle
        title="Secrets"
        subtitle="Keys for the services WonderHome uses. Each one is stored encrypted, never shown again once saved (only its last four characters), and needs your password to change."
      />
      <SettingGroups groups={groups} storeReady={storeReady} />
    </PageBody>
  );
}
