import { CLAUDE_ANSWER_MODEL, CLAUDE_INTAKE_MODEL, CLAUDE_MODEL, CLAUDE_UNDERSTANDING_MODEL } from "@wonderhome/core/ai/model-client";

import { settingGroupsFor } from "../../_lib/platform-settings-view";
import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";
import { SettingGroups } from "../_ui/setting-groups";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI & providers · Platform admin", robots: { index: false, follow: false } };

/** WonderHome's own AI key and provider, voice and Alexa. */
export default async function PlatformAiPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404
  const { groups, storeReady } = await settingGroupsFor(staff, "ai");
  const models = [
    { label: "Understanding a sentence", value: CLAUDE_UNDERSTANDING_MODEL, key: "WONDERHOME_AI_UNDERSTANDING_MODEL" },
    { label: "Composing an answer", value: CLAUDE_ANSWER_MODEL, key: "WONDERHOME_AI_ANSWER_MODEL" },
    { label: "Reading HomeSend", value: CLAUDE_INTAKE_MODEL, key: "WONDERHOME_AI_INTAKE_MODEL" },
    { label: "Everything else", value: CLAUDE_MODEL, key: "WONDERHOME_AI_MODEL" },
  ];

  return (
    <PageBody>
      <PageTitle title="AI & providers" subtitle="The key WonderHome uses when a household hasn't added its own, and the voice services. A household's own key always comes first." />
      <SettingGroups groups={groups} storeReady={storeReady} />
      <Panel title="Claude models" description="Which model each step uses. These are fixed when the server starts, so for now they change in Vercel and take effect on the next deploy.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {models.map((model) => (
            <li key={model.key} className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
              <p className="text-sm font-semibold">{model.label}</p>
              <p className="font-mono text-sm break-all">{model.value}</p>
              <code className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{model.key}</code>
            </li>
          ))}
        </ul>
      </Panel>
    </PageBody>
  );
}
