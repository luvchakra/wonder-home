import { CircleCheck, CloudCog, House, KeyRound, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { operationsSummary } from "@wonderhome/core/platform/admin";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { Badge } from "@wonderhome/core/ui/pill";

import { settingTotals } from "../_lib/platform-settings-view";
import { platformStaff } from "../_lib/platform-staff";
import { PageTitle, Panel } from "./_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform admin", robots: { index: false, follow: false } };

/** Each outside service, and the settings without which it stays off. */
const SERVICES: { name: string; needs: string[]; href: string }[] = [
  { name: "WonderHome's AI key", needs: ["WONDERHOME_AI_KEY"], href: "/platform-admin/ai" },
  { name: "Email", needs: ["WONDERHOME_SMTP_HOST", "WONDERHOME_SMTP_USER", "WONDERHOME_SMTP_PASSWORD"], href: "/platform-admin/integrations#group-email" },
  { name: "WhatsApp", needs: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME"], href: "/platform-admin/integrations#group-whatsapp" },
  { name: "Web push", needs: ["WONDERHOME_VAPID_PUBLIC_KEY", "WONDERHOME_VAPID_PRIVATE_KEY"], href: "/platform-admin/integrations#group-push" },
  { name: "Maps and places", needs: ["GOOGLE_MAPS_API_KEY"], href: "/platform-admin/integrations#group-places" },
  { name: "Films and shows", needs: ["TMDB_API_KEY"], href: "/platform-admin/integrations#group-films" },
  { name: "HomeSend email", needs: ["WONDERHOME_HOMESEND_EMAIL_DOMAIN", "RESEND_API_KEY"], href: "/platform-admin/integrations#group-homesend" },
  { name: "Upload scanning", needs: ["WONDERHOME_MALWARE_SCAN_KEY"], href: "/platform-admin/integrations#group-homesend" },
  { name: "Payments", needs: ["WONDERHOME_BILLING_PROVIDERS"], href: "/platform-admin/integrations#group-billing" },
];

/** The landing page: health at a glance, then where to go for each part of running WonderHome. */
export default async function PlatformAdminPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404

  const [summary, { totals, storeReady, statuses }] = await Promise.all([
    operationsSummary(adminClientFor(adminGrant.platformAdmin(staff, "count households for the overview"))),
    settingTotals(staff),
  ]);
  const isOn = (key: string) => {
    const status = statuses.get(key);
    if (!status || status.source === "unset") return false;
    return !(status.value === "off" || status.value === "none");
  };

  return (
    <main className="min-h-dvh px-4 py-8 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageTitle title="Platform admin" subtitle={`Here's how WonderHome is running today. You're signed in as ${staff.role}; nothing here shows a household's own data.`} />

        <MetricGrid
          metrics={[
            { label: "Households", value: summary.households, icon: House, tone: "home", href: "/platform-admin/households" },
            { label: "People", value: summary.members, icon: Users, tone: "people", href: "/platform-admin/households" },
            { label: "Open support grants", value: summary.activeSupportGrants, icon: ShieldCheck, tone: "health" },
          ]}
        />

        <Panel
          title="Settings"
          description={
            storeReady
              ? "Settings saved here reach every server within a minute, with no redeploy. Vercel keeps only what must stay there."
              : "The settings store isn't reachable just now, so every setting comes from Vercel."
          }
        >
          <MetricGrid
            metrics={[
              { label: "Saved here", value: totals.saved, icon: CircleCheck, tone: "handled", href: "/platform-admin/configuration" },
              { label: "Still from Vercel", value: totals.environment, icon: CloudCog, tone: "attention", href: "/platform-admin/integrations" },
              { label: "Saved here, also in Vercel", value: totals.stillInVercel, icon: KeyRound, tone: "neutral" },
            ]}
          />
          {totals.stillInVercel > 0 ? (
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {totals.stillInVercel === 1 ? "One Vercel variable is" : `${totals.stillInVercel} Vercel variables are`} no longer used and can be deleted there. Each is marked on its row.
            </p>
          ) : null}
        </Panel>

        <Panel title="Services" description="Each one is off until everything it needs is set.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {SERVICES.map((service) => {
              const ready = service.needs.every(isOn);
              return (
                <li key={service.name}>
                  <Link href={service.href} className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm hover:bg-[var(--wh-primary-soft)]">
                    <span className="min-w-0 break-words font-medium">{service.name}</span>
                    <Badge tone={ready ? "handled" : "neutral"}>{ready ? "On" : "Off"}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </main>
  );
}
