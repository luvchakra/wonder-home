import { Bell, Bot, ChevronRight, Database, HelpCircle, KeyRound, Link2, LogOut, Moon, ShieldCheck, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { credentialStatus } from "@wonderhome/core/ai/credentials";
import { describeKeySource, platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { describeDataUse } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { DELETION_GRACE_DAYS } from "@wonderhome/core/privacy/retention";
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
import { removeAiKey, saveAiKey } from "../(auth)/ai-key-actions";
import { saveDataUseAction } from "../(auth)/privacy-actions";
import { AiKeyForm } from "../_components/ai-key-form";
import { DataUseForm } from "../_components/data-use-form";
import { formatDate, requireSession } from "../_lib/session";

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
  const [user, { data: preferenceRows }, credential, dataUse] = await Promise.all([
    getVerifiedUser(),
    supabase.from("notification_preferences").select("channel, enabled, quiet_from, quiet_until").eq("member_id", membership.memberId),
    credentialStatus(supabase, membership.household.id).catch(() => ({ configured: false, provider: null, updatedAt: null })),
    loadDataUse(supabase, membership.household.id),
  ]);

  // Which key actually answers for this household, decided in one place so
  // the screen can never disagree with the server about it.
  const key = resolveModelKey(
    credential.configured && credential.provider ? { provider: credential.provider, key: "set" } : null,
    platformKey(),
  );
  const keyNote = describeKeySource(key.source);
  const manages = view.permissions.includes("household.manage");
  const preferences = (preferenceRows as PreferenceRow[] | null) ?? [];
  const inApp = preferences.find((p) => p.channel === "in_app");

  const rows: { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; href?: string; badge?: string }[] = [
    { icon: Bell, tone: "attention", title: "Notifications", meta: inApp?.quiet_from !== null && inApp?.quiet_from !== undefined ? `Quiet hours ${inApp.quiet_from}:00 – ${inApp.quiet_until}:00` : "In-app on · no quiet hours set", href: "/notifications" },
    { icon: ShieldCheck, tone: "primary", title: "Privacy & security", meta: "What is shared, how long it is kept, and taking your data with you", href: "/settings/privacy" },
    { icon: KeyRound, tone: "neutral", title: "Two-factor authentication", meta: "Coming — not switched on for this account yet", badge: "Soon" },
    { icon: Link2, tone: "care", title: "Connected accounts", meta: "School, calendar, shopping, weather", href: view.permissions.includes("integrations.manage") ? "/household/integrations" : undefined },
    { icon: Database, tone: "home", title: "Export my data", meta: "A copy of what WonderHome holds about you", href: "/settings/privacy" },
    { icon: Trash2, tone: "risk", title: "Delete my data", meta: `Removes what is yours, after ${DELETION_GRACE_DAYS} days to change your mind`, href: "/settings/privacy" },
    { icon: HelpCircle, tone: "ai", title: "Get Help", meta: "User guide, common questions, and a way to search them", href: "/help" },
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
          <SectionHeader title="AI assistant" />
          <Card className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Bot} tone="ai" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{keyNote.title}</p>
                <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{keyNote.detail}</p>
                {credential.configured && credential.updatedAt ? (
                  <p className="mt-1 text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                    Set {formatDate(membership.household.timezone, credential.updatedAt, "long")}
                  </p>
                ) : null}
              </div>
              <Badge tone={keyNote.tone === "attention" ? "attention" : "handled"}>
                {key.source === "household" ? "Your key" : key.source === "platform" ? "Included" : "Rules only"}
              </Badge>
            </div>

            {manages ? (
              <>
                <p className="text-xs text-[var(--wh-foreground-muted)]">
                  WonderHome runs the assistant on its own key, so you do not need an account with a model
                  provider. Use your own instead if you would rather the requests were billed to you and
                  covered by your own agreement with them.
                </p>
                <AiKeyForm
                  householdId={membership.household.id}
                  save={saveAiKey}
                  remove={removeAiKey}
                  configured={credential.configured}
                />
                {key.source === "none" ? (
                  <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-xs text-[var(--wh-foreground-muted)]">
                    This deployment has no key of its own either. An operator sets one with the
                    <code className="mx-1 rounded bg-[var(--wh-surface)] px-1 py-0.5 text-[0.6875rem]">WONDERHOME_AI_KEY</code>
                    environment variable — there is no platform administration screen for it.
                  </p>
                ) : null}
              </>
            ) : null}
          </Card>
        </section>

        <section>
          <SectionHeader title="What the assistant may share" />
          <Card className="space-y-4 p-4">
            {/* Read on the server every time. A screen cannot cache its way
                into a more permissive answer (story 15-005). */}
            <ul className="space-y-1.5">
              {describeDataUse(dataUse).map((line) => (
                <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
              ))}
            </ul>
            {manages ? (
              <DataUseForm
                action={saveDataUseAction}
                householdId={membership.household.id}
                policy={dataUse}
              />
            ) : (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">
                The Head of Family and administrators decide this for the household.
              </p>
            )}
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
