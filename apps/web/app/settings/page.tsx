import { Bell, ChevronRight, Database, HelpCircle, KeyRound, Link2, LogOut, Moon, ShieldCheck, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { getVerifiedUser } from "@wonderhome/core/db/server";

import { signOut } from "../(auth)/actions";
import { requireSession } from "../_lib/session";

export const metadata = { title: "Settings & profile" };
export const dynamic = "force-dynamic";

type PreferenceRow = { channel: string; enabled: boolean; quiet_from: number | null; quiet_until: number | null };

/**
 * Settings & Profile (requirements §23). What is here is real: the profile,
 * the household role, notification channels with quiet hours, the connected
 * accounts, and sign-out. What is not built yet — MFA, data export, deletion —
 * is listed as coming rather than as a button that does nothing.
 */
export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const { supabase, membership, view, viewer, secondary } = session;
  const [user, { data: preferenceRows }] = await Promise.all([
    getVerifiedUser(),
    supabase.from("notification_preferences").select("channel, enabled, quiet_from, quiet_until").eq("member_id", membership.memberId),
  ]);
  const preferences = (preferenceRows as PreferenceRow[] | null) ?? [];
  const inApp = preferences.find((p) => p.channel === "in_app");

  const rows: { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; href?: string; badge?: string }[] = [
    { icon: Bell, tone: "attention", title: "Notifications", meta: inApp?.quiet_from !== null && inApp?.quiet_from !== undefined ? `Quiet hours ${inApp.quiet_from}:00 – ${inApp.quiet_until}:00` : "In-app on · no quiet hours set", href: "/notifications" },
    { icon: ShieldCheck, tone: "primary", title: "Privacy & security", meta: "Sessions verified on every request · sensitive actions ask again" },
    { icon: KeyRound, tone: "neutral", title: "Two-factor authentication", meta: "Coming — not switched on for this account yet", badge: "Soon" },
    { icon: Link2, tone: "care", title: "Connected accounts", meta: "School, calendar, shopping, weather", href: view.permissions.includes("integrations.manage") ? "/household/integrations" : undefined },
    { icon: Database, tone: "home", title: "Export my data", meta: "Coming — a copy of everything WonderHome holds about you", badge: "Soon" },
    { icon: Trash2, tone: "risk", title: "Delete my account", meta: "Coming — removes you and what only you can see", badge: "Soon" },
    { icon: HelpCircle, tone: "ai", title: "Help & support", meta: "Ask WonderHome, or write to us", href: "/ai?q=How%20do%20I%20get%20help%3F" },
  ];

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings" back={{ href: "/more", label: "Back" }} title="Settings & profile">
      <div className="space-y-6">
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={view.displayName} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tracking-tight">{view.displayName}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{view.roleLabel} · {view.householdName}</p>
            <p className="truncate text-xs text-[var(--wh-foreground-subtle)]">{user?.email}</p>
          </div>
          <UserRound aria-hidden className="size-5 text-[var(--wh-foreground-subtle)]" />
        </Card>

        <section>
          <SectionHeader title="Household" />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              <li className="flex items-center gap-3 px-2 py-3"><IconTile icon={UserRound} tone="people" size="sm" /><span className="flex-1 text-sm">Role</span><Badge>{view.roleLabel}</Badge></li>
              <li className="flex items-center gap-3 px-2 py-3"><IconTile icon={Moon} tone="home" size="sm" /><span className="flex-1 text-sm">Time zone</span><span className="text-xs text-[var(--wh-foreground-muted)]">{membership.household.timezone}</span></li>
              <li className="flex items-center gap-3 px-2 py-3"><IconTile icon={ShieldCheck} tone="primary" size="sm" /><span className="flex-1 text-sm">What you can do</span><span className="text-xs text-[var(--wh-foreground-muted)]">{view.permissions.length} permissions</span></li>
            </ul>
          </Card>
        </section>

        <section>
          <SectionHeader title="Preferences, privacy & support" />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {rows.map((row) => {
                const inner = (
                  <>
                    <IconTile icon={row.icon} tone={row.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{row.title}</span>
                      <span className="block truncate text-xs text-[var(--wh-foreground-subtle)]">{row.meta}</span>
                    </span>
                    {row.badge ? <Badge>{row.badge}</Badge> : row.href ? <ChevronRight aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" /> : null}
                  </>
                );
                return (
                  <li key={row.title}>
                    {row.href ? <Link href={row.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2 hover:bg-[var(--wh-surface-muted)]">{inner}</Link> : <div className="flex min-h-14 items-center gap-3 px-2 py-2">{inner}</div>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full gap-2">
            <LogOut aria-hidden className="size-4" /> Log out
          </Button>
        </form>

        <QuoteCard>Your home. Your rules.</QuoteCard>
      </div>
    </AppShell>
  );
}
