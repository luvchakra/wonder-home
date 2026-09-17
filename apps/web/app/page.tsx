import { AppShell } from "@wonderhome/core/shell/app-shell";

import { AreaPlaceholder } from "./_components/area-placeholder";

export default function HomePage() {
  return (
    <AppShell active="home">
      <AreaPlaceholder
        title="Home"
        lede="What needs your attention, and what WonderHome handled."
        nextUp="Actionable cards arrive with the outcome engine (module 03) and the notification decision engine (module 06)."
      />
    </AppShell>
  );
}
