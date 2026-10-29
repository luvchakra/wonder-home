import { Bell, Bot, ChevronRight, CreditCard, FileClock, House, Languages, Link2, MapPin, MicVocal, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { credentialStatus } from "@wonderhome/core/ai/credentials";
import { describeKeySource, platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { listPlans, loadSubscription } from "@wonderhome/core/billing/repository";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { loadVoiceSettings } from "@wonderhome/core/voice/repository";
import { describeVoice } from "@wonderhome/core/voice/settings";
import { whatsappBusinessNumber } from "@wonderhome/core/whatsapp/linking";
import { listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";

import { OpenOnHash } from "../_components/open-on-hash";
import { requireSession } from "../_lib/session";
import { ActivitySection } from "./_household/activity-section";
import { AddressSection } from "./_household/address-section";
import { ManageSection } from "./_household/manage-section";
import { SettingsSearch, type SettingsSearchEntry } from "./_components/settings-search";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

type Row = { icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; href: string };

/** The rows inside a settings fold: each opens the one place that setting is edited (rule 23). */
function SettingsRows({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
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
  );
}

/**
 * Settings: the app and household level (the owner's 2026-10-29 split). What
 * configures WonderHome itself or the household lives here — the AI assistant
 * and its autonomy, voice, connections to outside services, the plan, and (for
 * Admins) Manage Household, the address and the activity log. Anything personal
 * to the signed-in person — their identity, language, notifications, privacy and
 * location — is on Profile (`/settings/profile`) instead, so each setting still
 * has exactly one editor (design rule 23). Its door is the sidebar "Settings"
 * item; Profile's is the avatar menu.
 *
 * Laid out as a short stack of collapsible chevron cards (the owner, 2026-10-29),
 * grouped and ordered from most-used to administrative: the assistant (open),
 * then connections and the plan, then — for Admins — the household's own
 * administration (Manage Household, the home address and the activity record),
 * each folded closed. Deep links like `/settings?tab=household#address` or
 * `#playbook` still reveal their card via {@link OpenOnHash}.
 */
export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const { supabase, membership, view, viewer, secondary } = session;
  const { t } = session.locale;
  const isAdmin = view.permissions.includes("household.manage");
  const householdId = membership.household.id;
  const whatsappReady = whatsappConfigFromEnv() !== null && whatsappBusinessNumber() !== null;

  const [credential, voiceSettings, subscription, plans, whatsappLinks] = await Promise.all([
    credentialStatus(supabase, householdId).catch(() => ({ configured: false, provider: null, updatedAt: null })),
    loadVoiceSettings(supabase, householdId),
    loadSubscription(supabase, householdId).catch(() => null),
    listPlans(supabase).catch(() => []),
    whatsappReady ? listWhatsAppLinks(supabase, householdId).catch(() => []) : Promise.resolve([]),
  ]);

  // Which key actually answers for this household, decided in one place so
  // the row can never disagree with the AI Assistant page about it.
  const key = resolveModelKey(credential.configured && credential.provider ? { provider: credential.provider, key: "set" } : null, platformKey());
  const keyNote = describeKeySource(key.source);
  const planName = plans.find((plan) => plan.key === subscription?.planKey)?.name ?? "Free";
  const myWhatsApp = whatsappLinks.some((link) => link.memberId === membership.memberId);

  // The assistant: its model and autonomy, and how it speaks and listens.
  const assistant: Row[] = [
    { icon: Bot, tone: "ai", title: t("settingsPage.ai.title"), meta: t("settingsHome.ai.meta", { source: keyNote.title }), href: "/settings/ai" },
    { icon: MicVocal, tone: "ai", title: t("settingsPage.voice.title"), meta: describeVoice(voiceSettings), href: "/settings/voice" },
  ];
  // Everything linked to the household is one page (design/UI-SIMPLIFICATION-v1.md M2): WhatsApp,
  // voice assistants, school, Swiggy Instamart and every other service.
  const connected: Row[] = [
    {
      icon: Link2,
      tone: "care",
      title: t("connectionsPage.title"),
      meta: myWhatsApp ? `WhatsApp · ${t("settingsHome.whatsapp.connected")}` : t("connectionsPage.meta"),
      href: "/settings/connections",
    },
  ];
  const plan: Row[] = [{ icon: CreditCard, tone: "money", title: t("settingsPage.plan.title"), meta: t("settingsHome.plan.meta", { plan: planName }), href: "/settings/plan" }];

  // What the search at the top can find: every row above, the household's own sections
  // (Admins only) and the personal pages that live on Profile.
  const fromRows = (rows: Row[], group: string): SettingsSearchEntry[] =>
    rows.map((row) => ({ id: row.href, title: row.title, group, meta: row.meta, href: row.href, icon: <IconTile icon={row.icon} tone={row.tone} size="sm" /> }));
  const section = (id: string, title: string, group: string, icon: Row["icon"], tone: IconTone, href = `/settings#${id}`): SettingsSearchEntry => ({
    id,
    title,
    group,
    href,
    icon: <IconTile icon={icon} tone={tone} size="sm" />,
  });
  const manageName = t("nav.item.manage");
  const profileName = t("nav.item.profile");
  const searchEntries: SettingsSearchEntry[] = [
    ...(isAdmin
      ? [
          section("address", t("manage.section.address"), manageName, MapPin, "home"),
          section("manage", manageName, manageName, House, "home"),
          section("playbook", t("manage.section.playbook"), manageName, House, "home"),
          section("policies", t("manage.section.policies"), manageName, House, "home"),
          section("autonomy", t("manage.section.autonomy"), manageName, Bot, "ai"),
          section("activity", t("manage.section.activity"), manageName, FileClock, "neutral"),
        ]
      : []),
    ...fromRows(assistant, t("settingsHome.group.assistant")),
    ...fromRows(connected, t("connectionsPage.title")),
    ...fromRows(plan, t("settingsPage.plan.title")),
    { id: "profile", title: profileName, group: profileName, href: "/settings/profile", icon: <IconTile icon={User} tone="primary" size="sm" /> },
    section("language", t("settings.languageRegion"), profileName, Languages, "primary", "/settings/language-region"),
    section("notifications", t("settingsPage.notifications.title"), profileName, Bell, "attention", "/settings/notifications"),
    section("privacy", t("settingsHome.privacy.title"), profileName, ShieldCheck, "primary", "/settings/privacy"),
    section("location", t("location.title"), profileName, MapPin, "people", "/settings/location"),
  ];

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings" back={{ href: "/more", label: t("common.back") }} title={t("nav.item.settings")}>
      <div className="space-y-4">
        <OpenOnHash />
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.settings")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsHome.lede", { household: membership.household.name })}</p>
        </header>

        <SettingsSearch entries={searchEntries} labels={{ placeholder: t("settingsSearch.placeholder"), clear: t("settingsSearch.clear"), none: t("settingsSearch.none", { query: "{query}" }) }}>
          <div className="space-y-4">
          {isAdmin ? (
            <>
              <CollapsibleSection id="address" icon={MapPin} tone="home" title={t("manage.section.address")} intro={t("address.lede", { household: membership.household.name })}>
                <AddressSection session={session} />
              </CollapsibleSection>
              <CollapsibleSection id="manage" icon={House} tone="home" title={t("nav.item.manage")} intro={t("manage.lede", { household: membership.household.name })}>
                <ManageSection session={session} />
              </CollapsibleSection>
            </>
          ) : null}

          <CollapsibleSection icon={Bot} tone="ai" title={t("settingsHome.group.assistant")} defaultOpen>
            <SettingsRows rows={assistant} />
          </CollapsibleSection>

          <CollapsibleSection
            icon={Link2}
            tone="care"
            title={t("connectionsPage.title")}
            intro={myWhatsApp ? `WhatsApp · ${t("settingsHome.whatsapp.connected")}` : t("connectionsPage.meta")}
          >
            <SettingsRows rows={connected} />
          </CollapsibleSection>

          {isAdmin ? (
            <CollapsibleSection id="activity" icon={FileClock} tone="neutral" title={t("manage.section.activity")} intro={t("manage.section.activityMeta")}>
              <ActivitySection session={session} />
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection icon={CreditCard} tone="money" title={t("settingsPage.plan.title")} intro={t("settingsHome.plan.meta", { plan: planName })}>
            <SettingsRows rows={plan} />
          </CollapsibleSection>
          </div>
        </SettingsSearch>

        <QuoteCard>{t("settingsHome.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
