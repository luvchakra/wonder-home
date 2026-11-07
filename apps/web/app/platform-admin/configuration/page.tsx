import { settingGroupsFor } from "../../_lib/platform-settings-view";
import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";
import { SettingGroups } from "../_ui/setting-groups";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuration · Platform admin", robots: { index: false, follow: false } };

const STAYS_IN_VERCEL = [
  { name: "Database address and keys", why: "Needed to reach the database these settings live in." },
  { name: "Cron and webhook secrets", why: "They check that a call in really came from the scheduler, Meta, Alexa or a payment provider." },
  { name: "Supabase access token", why: "It controls the whole database project, so it isn't kept inside it." },
  { name: "Build-time values (NEXT_PUBLIC_…)", why: "Built into the pages people's browsers load." },
  { name: "Security headers and log level", why: "Read on every request, before the database is." },
];

/** Feature switches, and what stays in Vercel and why. */
export default async function PlatformConfigurationPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404
  const { groups, storeReady } = await settingGroupsFor(staff, "configuration");

  return (
    <PageBody>
      <PageTitle title="Configuration" subtitle="Switches for whole features. A change here reaches every server within a minute, with no redeploy." />
      <SettingGroups groups={groups} storeReady={storeReady} />
      <Panel title="What stays in Vercel" description="Everything else is here. These few stay in Vercel on purpose.">
        <ul className="space-y-2">
          {STAYS_IN_VERCEL.map((item) => (
            <li key={item.name} className="text-sm">
              <span className="font-semibold">{item.name}</span>
              <span className="text-[var(--wh-foreground-muted)]">: {item.why}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </PageBody>
  );
}
