import { Bell, Bot, ChevronRight, CreditCard, Languages, Link2, LogOut, MessageCircle, MicVocal, ShieldCheck, Speaker, UserRound } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { credentialStatus } from "@wonderhome/core/ai/credentials";
import { describeKeySource, platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { listPlans, loadSubscription } from "@wonderhome/core/billing/repository";
import { getVerifiedUser } from "@wonderhome/core/db/server";
import { languageInfo } from "@wonderhome/core/i18n/locales";
import { regionName } from "@wonderhome/core/i18n/options";
import { listMembers } from "@wonderhome/core/identity/households";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { loadVoiceSettings } from "@wonderhome/core/voice/repository";
import { describeVoice } from "@wonderhome/core/voice/settings";
import { whatsappBusinessNumber } from "@wonderhome/core/whatsapp/linking";
import { listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";

import { signOut } from "../(auth)/actions";
import { MemberAvatarControl } from "../_components/member-avatar-control";
import { MemberProfileForm } from "../_components/member-profile-form";
import { requireSession, roleWords } from "../_lib/session";

export const metadata = { title: "Settings & Profile" };
export const dynamic = "force-dynamic";

type PreferenceRow = { channel: string; enabled: boolean; quiet_from: number | null; quiet_until: number | null };
type Row = { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; href: string };

/** One group of settings: every row opens the one place that setting is edited. */
function SettingsGroup({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionHeader title={title} />
      <Card className="p-2">
        <ul className="divide-y divide-[var(--wh-border)]">
          {rows.map((row) => (
            <li key={row.href}>
              <Link href={row.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2 hover:bg-[var(--wh-surface-muted)]">
                <IconTile icon={row.icon} tone={row.tone} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{row.title}</span>
                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">{row.meta}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/**
 * Settings & Profile: one landing page, and one editor per setting (the
 * Settings consolidation). The profile is edited here; everything else is a
 * row that opens its own canonical page — Language & Region, Notifications,
 * Voice, Voice assistants, the AI assistant, Privacy, WhatsApp, Connected
 * accounts and the plan. Nothing is listed that is not built, and a row only
 * appears where this person can use what it opens.
 */
export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const whatsappReady = whatsappConfigFromEnv() !== null && whatsappBusinessNumber() !== null;
  const [user, { data: preferenceRows }, credential, voiceSettings, members, subscription, plans, whatsappLinks] = await Promise.all([
    getVerifiedUser(),
    supabase.from("notification_preferences").select("channel, enabled, quiet_from, quiet_until").eq("member_id", membership.memberId),
    credentialStatus(supabase, householdId).catch(() => ({ configured: false, provider: null, updatedAt: null })),
    loadVoiceSettings(supabase, householdId),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    loadSubscription(supabase, householdId).catch(() => null),
    listPlans(supabase).catch(() => []),
    whatsappReady ? listWhatsAppLinks(supabase, householdId).catch(() => []) : Promise.resolve([]),
  ]);
  const me = members.find((member) => member.id === membership.memberId) ?? null;

  // Which key actually answers for this household, decided in one place so
  // the row can never disagree with the AI Assistant page about it.
  const key = resolveModelKey(credential.configured && credential.provider ? { provider: credential.provider, key: "set" } : null, platformKey());
  const keyNote = describeKeySource(key.source);
  const preferences = (preferenceRows as PreferenceRow[] | null) ?? [];
  const inApp = preferences.find((p) => p.channel === "in_app");
  const planName = plans.find((plan) => plan.key === subscription?.planKey)?.name ?? "Free";
  const myWhatsApp = whatsappLinks.some((link) => link.memberId === membership.memberId);
  const { t, preferences: localePreferences } = session.locale;

  const personal: Row[] = [
    // Language, region, currency, time and units (story 22-002) — first,
    // because it changes how every other screen reads.
    {
      icon: Languages,
      tone: "primary",
      title: t("settings.languageRegion"),
      meta: `${languageInfo(localePreferences.language).nativeName} · ${regionName(localePreferences.region, localePreferences.language)} · ${localePreferences.currency} · ${membership.household.timezone}`,
      href: "/settings/language-region",
    },
    {
      icon: Bell,
      tone: "attention",
      title: t("settingsPage.notifications.title"),
      meta:
        inApp?.quiet_from !== null && inApp?.quiet_from !== undefined
          ? t("settingsHome.notifications.quiet", { from: inApp.quiet_from, until: inApp.quiet_until ?? "" })
          : t("settingsHome.notifications.meta"),
      href: "/settings/notifications",
    },
    { icon: MicVocal, tone: "ai", title: t("settingsPage.voice.title"), meta: describeVoice(voiceSettings), href: "/settings/voice" },
    { icon: Speaker, tone: "ai", title: t("settingsHome.voiceAssistants.title"), meta: t("settingsHome.voiceAssistants.meta"), href: "/settings/voice-assistants" },
  ];
  const aiAndPrivacy: Row[] = [
    { icon: Bot, tone: "ai", title: t("settingsPage.ai.title"), meta: t("settingsHome.ai.meta", { source: keyNote.title }), href: "/settings/ai" },
    { icon: ShieldCheck, tone: "primary", title: t("settingsHome.privacy.title"), meta: t("settingsHome.privacy.meta"), href: "/settings/privacy" },
  ];
  const connected: Row[] = [
    // WhatsApp only once the deployment has a number to connect to.
    ...(whatsappReady
      ? [{ icon: MessageCircle, tone: "handled" as IconTone, title: "WhatsApp", meta: myWhatsApp ? t("settingsHome.whatsapp.connected") : t("settingsHome.whatsapp.meta"), href: "/settings/whatsapp" }]
      : []),
    ...(view.permissions.includes("integrations.manage")
      ? [{ icon: Link2, tone: "care" as IconTone, title: t("settingsHome.connected.title"), meta: t("settingsHome.connected.meta"), href: "/household/integrations" }]
      : []),
  ];
  const plan: Row[] = [{ icon: CreditCard, tone: "money", title: t("settingsPage.plan.title"), meta: t("settingsHome.plan.meta", { plan: planName }), href: "/settings/plan" }];

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings" back={{ href: "/more", label: t("common.back") }} title={t("nav.item.settings")}>
      <div className="space-y-6">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.settings")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsHome.lede", { household: membership.household.name })}</p>
        </header>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold tracking-tight">{view.displayName}</p>
              <p className="text-sm text-[var(--wh-foreground-muted)]">{roleWords(view.roleLabel, t)} · {view.householdName}</p>
              <p className="text-xs break-all text-[var(--wh-foreground-subtle)]">{user?.email}</p>
            </div>
            {me ? (
              <MemberProfileForm
                householdId={householdId}
                memberId={me.id}
                initial={{
                  displayName: me.displayName,
                  dateOfBirth: me.dateOfBirth,
                  nickname: me.nickname,
                  relationship: me.relationship,
                  occupation: me.occupation,
                  schoolOrWorkLocation: me.schoolOrWorkLocation,
                  specialOccasionLabel: me.specialOccasionLabel,
                  specialOccasionDate: me.specialOccasionDate,
                  gender: me.gender,
                  notes: me.notes,
                }}
              />
            ) : (
              <UserRound aria-hidden className="size-5 shrink-0 text-[var(--wh-foreground-subtle)]" />
            )}
          </div>
          {me ? (
            <MemberAvatarControl
              householdId={householdId}
              memberId={me.id}
              displayName={me.displayName}
              avatarUrl={me.avatarUrl}
              labels={{
                add: t("settingsHome.avatar.add"),
                change: t("settingsHome.avatar.change"),
                uploading: t("settingsHome.avatar.uploading"),
                remove: t("settingsHome.avatar.remove"),
                removing: t("settingsHome.avatar.removing"),
              }}
            />
          ) : (
            <Avatar name={view.displayName} size="xl" />
          )}
        </Card>

        <SettingsGroup title={t("settingsHome.group.personal")} rows={personal} />
        <SettingsGroup title={t("settingsHome.group.aiPrivacy")} rows={aiAndPrivacy} />
        <SettingsGroup title={t("settingsHome.group.connected")} rows={connected} />
        <SettingsGroup title={t("settingsHome.group.plan")} rows={plan} />

        <section>
          <SectionHeader title={t("settingsHome.group.account")} />
          <form action={signOut}>
            <Button type="submit" variant="secondary" className="w-full gap-2">
              <LogOut aria-hidden className="size-4" /> {t("nav.logout")}
            </Button>
          </form>
        </section>

        <QuoteCard>{t("settingsHome.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
