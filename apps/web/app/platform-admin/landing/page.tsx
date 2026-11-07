import { notFound } from "next/navigation";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { landingVariant } from "@wonderhome/core/platform/settings";
import { Card } from "@wonderhome/core/ui/card";

import { platformStaff } from "../../_lib/platform-staff";
import { LandingVariantForm } from "./variant-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Landing page", robots: { index: false, follow: false } };

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Which public home page signed-out visitors see. Takes effect with no redeploy, within the cache's 30 seconds. */
export default async function LandingSettingPage() {
  const staff = await platformStaff("settings.manage");
  if (!staff) notFound();
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "show the landing page setting"));
  const [current, events] = await Promise.all([
    landingVariant(admin),
    admin.from("platform_setting_events").select("old_value, new_value, created_at, actor_profile_id").eq("key", "landing.variant").order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <main className="min-h-dvh px-4 py-10 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">Landing page</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Signed-out visitors at the home address see the page chosen here. Signed-in members go straight to the app either way.
          </p>
        </header>
        <Card className="p-5"><LandingVariantForm current={current} /></Card>
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold tracking-tight">Changes</h2>
          {(events.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--wh-foreground-muted)]">No change yet; the new landing page is the default.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(events.data ?? []).map((event) => (
                <li key={event.created_at as string}>
                  {String(event.old_value ?? "default")} → {String(event.new_value)}
                  <span className="text-[var(--wh-foreground-muted)]"> · {when(event.created_at as string)} · by {event.actor_profile_id === staff.profileId ? "you" : "another admin"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
