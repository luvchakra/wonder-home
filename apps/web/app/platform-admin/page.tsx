import { platformOverview } from "../_lib/platform-overview";
import { settingTotals } from "../_lib/platform-settings-view";
import { platformStaff } from "../_lib/platform-staff";
import { OverviewView } from "./_ui/overview-view";

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

/** The landing page: reads the figures in one wave, then draws them (`_ui/overview-view.tsx`). */
export default async function PlatformAdminPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404

  const [{ period }, { snapshot, advisor }, { totals, storeReady, statuses }] = await Promise.all([
    searchParams,
    platformOverview(staff),
    settingTotals(staff),
  ]);
  const isOn = (key: string) => {
    const status = statuses.get(key);
    if (!status || status.source === "unset") return false;
    return !(status.value === "off" || status.value === "none");
  };

  return (
    <OverviewView
      snapshot={snapshot}
      advisor={advisor}
      settings={{ saved: totals.saved, environment: totals.environment, stillInVercel: totals.stillInVercel, storeReady }}
      services={SERVICES.map((service) => ({ name: service.name, href: service.href, ready: service.needs.every(isOn) }))}
      period={period === "30" ? 30 : 7}
      role={staff.role}
    />
  );
}
