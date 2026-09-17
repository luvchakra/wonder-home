import { AppShell } from "@wonderhome/core/shell/app-shell";

import { AreaPlaceholder } from "../_components/area-placeholder";

export const metadata = { title: "AI" };

export default function AiPage() {
  return (
    <AppShell active="ai">
      <AreaPlaceholder
        title="WonderHome AI"
        lede="Talk or type — one conversation engine for both."
        nextUp="Voice and text land with the conversation module (module 04), with action previews before anything consequential runs."
      />
    </AppShell>
  );
}
