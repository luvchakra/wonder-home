import { Bot, ChevronRight, CreditCard, Link2, MicVocal } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { credentialStatus } from "@wonderhome/core/ai/credentials";
import { describeKeySource, platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { listPlans, loadSubscription } from "@wonderhome/core/billing/repository";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { loadVoiceSettings } from "@wonderhome/core/voice/repository";
import { describeVoice } from "@wonderhome/core/voice/settings";
import { whatsappBusinessNumber } from "@wonderhome/core/whatsapp/linking";
import { listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";

import { requireSession } from "../_lib/session";
import { ActivitySection } from "./_household/activity-section";
import { AddressSection } from "./_household/address-section";
import { ManageSection } from "./_household/manage-section";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

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
 * Settings: the app and household level (the owner's 2026-10-29 split). What
 * configures WonderHome itself or the household lives here — the AI assistant
 * and its autonomy, voice, connections to outside services, the plan, and (for
 * Admins) Manage Household, the address and the activity log. Anything personal
 * to the signed-in person — their identity, language, notifications, privacy and
 * location — is on Profile (`/settings/profile`) instead, so each setting still
 * has exactly one editor (design rule 23). Its door is the sidebar "Settings"
 * item; Profile's is the avatar menu.
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

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings" back={{ href: "/more", label: t("common.back") }} title={t("nav.item.settings")}>
      <div className="space-y-6">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.settings")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsHome.lede", { household: membership.household.name })}</p>
        </header>

        <SettingsGroup title={t("settingsHome.group.assistant")} rows={assistant} />
        <SettingsGroup title={t("settingsHome.group.connected")} rows={connected} />
        <SettingsGroup title={t("settingsHome.group.plan")} rows={plan} />

        {isAdmin ? (
          <>
            <ManageSection session={session} />
            <AddressSection session={session} />
            <ActivitySection session={session} />
          </>
        ) : null}

        <QuoteCard>{t("settingsHome.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
