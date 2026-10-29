import { Bell, ChevronRight, Languages, LogOut, MapPin, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { getVerifiedUser } from "@wonderhome/core/db/server";
import { languageInfo } from "@wonderhome/core/i18n/locales";
import { regionName } from "@wonderhome/core/i18n/options";
import { listMembers, WORK_ARRANGEMENTS } from "@wonderhome/core/identity/households";
import { loadWorkPlace } from "@wonderhome/core/household/work-place";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { PrivacyNote } from "@wonderhome/core/ui/privacy-note";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { signOut } from "../../(auth)/actions";
import { MemberAvatarControl } from "../../_components/member-avatar-control";
import { MemberProfileForm } from "../../_components/member-profile-form";
import { officeField } from "../../_lib/office-field";
import { requireSession, roleWords } from "../../_lib/session";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

type PreferenceRow = { channel: string; enabled: boolean; quiet_from: number | null; quiet_until: number | null };
type Row = { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; href: string };

/** One group of rows: each opens the one place that setting is edited (rule 23). */
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
 * Profile: everything personal to the signed-in person (the owner's 2026-10-29
 * split). Their identity — name, nickname, date of birth, gender, photo and
 * work — and the preferences that are theirs alone: language & region, how they
 * are notified, their privacy and data rights, and whether they share their
 * location. The app and the household are configured in Settings
 * (`/settings`) instead, so each setting still has exactly one editor
 * (design rule 23). Its door is the avatar menu; Settings' is the sidebar.
 */
export default async function ProfilePage() {
  const session = await requireSession("/settings/profile");
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const [user, { data: preferenceRows }, members, myOffice, mySharing] = await Promise.all([
    getVerifiedUser(),
    supabase.from("notification_preferences").select("channel, enabled, quiet_from, quiet_until").eq("member_id", membership.memberId),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    // Their own picked office (HomePlaces 24-005), edited here like the rest of their profile.
    loadWorkPlace(supabase, householdId, membership.memberId).catch(() => null),
    // Whether they share where they are (their own row; RLS lets every member read who shares).
    supabase.from("member_location_sharing").select("enabled").eq("member_id", membership.memberId).maybeSingle().then((result) => Boolean((result.data as { enabled?: boolean } | null)?.enabled), () => false),
  ]);
  const me = members.find((member) => member.id === membership.memberId) ?? null;
  const preferences = (preferenceRows as PreferenceRow[] | null) ?? [];
  const inApp = preferences.find((p) => p.channel === "in_app");
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
  ];
  const privacy: Row[] = [
    { icon: ShieldCheck, tone: "primary", title: t("settingsHome.privacy.title"), meta: t("settingsHome.privacy.meta"), href: "/settings/privacy" },
    { icon: MapPin, tone: "people", title: t("location.title"), meta: mySharing ? t("location.meta.on") : t("location.meta.off"), href: "/settings/location" },
  ];

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/profile" back={{ href: "/more", label: t("common.back") }} title={t("nav.item.profile")}>
      <div className="space-y-6">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.profile")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("profileHome.lede")}</p>
        </header>

        <Card id="profile" className="scroll-mt-20 space-y-4 p-5">
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
                  nicknamePreferred: me.nicknamePreferred ?? false,
                  relationship: me.relationship,
                  occupation: me.occupation,
                  schoolOrWorkLocation: me.schoolOrWorkLocation,
                  specialOccasionLabel: me.specialOccasionLabel,
                  specialOccasionDate: me.specialOccasionDate,
                  gender: me.gender,
                  notes: me.notes,
                  memberType: me.memberType,
                  workArrangement: me.workArrangement ?? null,
                  workHours: me.workHours ?? null,
                }}
                workOptions={me.memberType === "adult" ? WORK_ARRANGEMENTS.map((value) => ({ value, label: t(`setupWizard.work.${value}`) })) : undefined}
                office={me.memberType === "adult" ? officeField(myOffice) : undefined}
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
            <Avatar name={view.displayName} size="xl" imageUrl={viewer.avatarUrl ?? undefined} />
          )}
          <PrivacyNote line={t("privacyNote.line")} more={t("privacyNote.more")} />
        </Card>

        <SettingsGroup title={t("settingsHome.group.personal")} rows={personal} />
        <SettingsGroup title={t("settingsHome.group.privacy")} rows={privacy} />

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
