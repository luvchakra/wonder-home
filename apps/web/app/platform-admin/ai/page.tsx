import { settingGroupsFor } from "../../_lib/platform-settings-view";
import { staffStepUp } from "../../_lib/platform-step-up";
import { platformStaff } from "../../_lib/platform-staff";
import { platformCan } from "@wonderhome/core/platform/admin";

import { platformKeyHealth } from "../../_lib/platform-ai-key";
import { AiKeyHealth } from "../_ui/ai-key-health";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";
import { SettingGroups } from "../_ui/setting-groups";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI & providers · Platform admin", robots: { index: false, follow: false } };

/** WonderHome's own AI key and provider, voice and Alexa. */
export default async function PlatformAiPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404
  const [{ groups, storeReady }, stepUp, health] = await Promise.all([settingGroupsFor(staff, "ai"), staffStepUp(), platformKeyHealth(staff)]);

  return (
    <PageBody>
      <PageTitle title="AI & providers" subtitle="The key WonderHome uses when a household hasn't added its own, and the voice services. A household's own key always comes first." />
      <Panel id="ai-key-health" title="Is WonderHome's key working?" description="Checked with the provider when the key is saved, and whenever you press Test key. A refused key is never kept as working.">
        <AiKeyHealth provider={health.provider} last4={health.last4} alertLine={health.alertLine} canTest={platformCan(staff, "settings.manage")} homesOnOwnKey={health.homesOnOwnKey ?? null} />
      </Panel>
      <SettingGroups groups={groups} storeReady={storeReady} stepUp={stepUp} next="/platform-admin/ai" />
    </PageBody>
  );
}
