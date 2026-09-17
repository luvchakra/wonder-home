import { AppShell } from "@wonderhome/core/shell/app-shell";

import { AreaPlaceholder } from "../_components/area-placeholder";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <AppShell active="today">
      <AreaPlaceholder
        title="Today"
        lede="Your actions, decisions and time-sensitive outcomes for today."
        nextUp="Personalized plans arrive with identity and personalized views (module 01) and the routine engine (module 03)."
        quote="Small steps today, happier tomorrows."
      />
    </AppShell>
  );
}
