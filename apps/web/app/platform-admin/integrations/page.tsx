import Link from "next/link";

import { settingGroupsFor } from "../../_lib/platform-settings-view";
import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle } from "../_ui/page-title";
import { SettingGroups } from "../_ui/setting-groups";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations · Platform admin", robots: { index: false, follow: false } };

/** Every outside service WonderHome talks to, with its settings and keys side by side. */
export default async function PlatformIntegrationsPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404
  const { groups, storeReady } = await settingGroupsFor(staff, "integrations");

  return (
    <PageBody>
      <PageTitle
        title="Integrations"
        subtitle={
          <>
            WhatsApp, email, maps, weather, payments and the rest, each off until its settings are in. The WonderJobs key is on{" "}
            <Link href="/platform-admin/careers" className="font-medium text-[var(--wh-primary)] hover:underline">
              Careers connection
            </Link>
            .
          </>
        }
      />
      <SettingGroups groups={groups} storeReady={storeReady} />
    </PageBody>
  );
}
