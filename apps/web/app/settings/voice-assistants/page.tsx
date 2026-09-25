import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { channelSummary, type Capability, type CapabilityChannel } from "@wonderhome/core/voicelink/capabilities";
import { voiceOAuthClients } from "@wonderhome/core/voicelink/oauth";
import { listVoiceLinks, type VoiceLink } from "@wonderhome/core/voicelink/repository";
import { AudioLines, Speaker, Unlink } from "lucide-react";

import { revokeVoiceLinkAction } from "../../(auth)/voice-link-actions";
import { formatDate, requireSession } from "../../_lib/session";
import { capabilityLabel, scopeLabel } from "../../_lib/settings-labels";

export const metadata = { title: "Voice assistants" };
export const dynamic = "force-dynamic";

const PROVIDER_NAMES: Record<VoiceLink["provider"], string> = { amazon_alexa: "Alexa", gemini: "Gemini Voice" };

/** Why a capability depends on something, in the household's words (voice phase 5). */
function conditionFor(t: Translate, policy: string): string | null {
  if (policy === "consent") return t("settingsPage.voiceAssistants.condition.consent");
  if (policy === "opt_in") return t("settingsPage.voiceAssistants.condition.opt_in");
  return null;
}

// The channels' names are product names and stay as they are.
const VOICE_CHANNELS: { channel: "gemini_voice" | "alexa"; name: string }[] = [
  { channel: "gemini_voice", name: "Gemini Voice" },
  { channel: "alexa", name: "Alexa" },
];

function CapabilityList({ title, items, channel, t }: { title: string; items: Capability[]; channel: CapabilityChannel; t: Translate }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((capability) => {
          const condition = conditionFor(t, capability.policy[channel]);
          return (
            <li key={capability.id} className="text-sm">
              {capabilityLabel(t, capability)}
              {condition ? <span className="text-[var(--wh-foreground-muted)]"> — {condition}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Voice assistants linked to this home (voice phase 2): who each one speaks
 * for, what it may do, and a way to unlink it that works at once — its
 * tokens stop, and nothing in the home is deleted. A member sees their own
 * links; an admin sees every link in the household and can unlink any of
 * them. Linking itself starts in the assistant's own app, never here, so the
 * page says so rather than offering a button with nothing behind it.
 */
export default async function VoiceAssistantsPage() {
  const session = await requireSession("/settings/voice-assistants");
  const { supabase, membership, viewer, secondary } = session;
  const household = membership.household;
  const [links, members] = await Promise.all([
    listVoiceLinks(supabase, household.id).catch(() => null),
    supabase.from("household_members").select("id, display_name").eq("household_id", household.id),
  ]);
  const names = new Map(((members.data as { id: string; display_name: string }[] | null) ?? []).map((row) => [row.id, row.display_name]));
  const configured = voiceOAuthClients().map((client) => PROVIDER_NAMES[client.provider]);
  const active = (links ?? []).filter((link) => link.status === "active");
  const past = (links ?? []).filter((link) => link.status === "revoked");
  const { t, preferences } = session.locale;
  const aMember = t("settingsPage.aMember");
  let apps = configured.join(" / ");
  try {
    apps = new Intl.ListFormat(preferences.language, { type: "disjunction" }).format(configured);
  } catch {
    // The names still read, joined plainly.
  }

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/voice-assistants" back={{ href: "/settings", label: t("settingsPage.backToSettings") }} title={t("settingsPage.voiceAssistants.title")}>
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.voiceAssistants.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.voiceAssistants.lede", { household: household.name })}</p>
        </header>

        <Card className="flex items-start gap-3">
          <IconTile icon={Speaker} tone="ai" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{t("settingsPage.voiceAssistants.linking")}</p>
            <p className="mt-0.5 text-[var(--wh-foreground-muted)]">
              {configured.length > 0 ? t("settingsPage.voiceAssistants.linkingHow", { apps }) : t("settingsPage.voiceAssistants.linkingNone")}
            </p>
          </div>
        </Card>

        {links === null ? (
          <Card><p className="text-sm text-[var(--wh-risk)]">{t("settingsPage.voiceAssistants.readError")}</p></Card>
        ) : active.length === 0 ? (
          <EmptyState icon={Speaker} tone="ai" title={t("settingsPage.voiceAssistants.empty")} description={t("settingsPage.voiceAssistants.emptyBody")} />
        ) : (
          <ul className="space-y-3">
            {active.map((link) => (
              <li key={link.id}>
                <Card className="flex items-start gap-3">
                  <IconTile icon={Speaker} tone="ai" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{PROVIDER_NAMES[link.provider]} · {names.get(link.memberId) ?? aMember}</p>
                    <p className="mt-0.5 text-[var(--wh-foreground-muted)]">
                      {link.lastUsedAt
                        ? t("settingsPage.voiceAssistants.linkedUsed", {
                            date: formatDate(household.timezone, link.linkedAt),
                            lastUsed: formatDate(household.timezone, link.lastUsedAt),
                          })
                        : t("settingsPage.voiceAssistants.linkedUnused", { date: formatDate(household.timezone, link.linkedAt) })}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {link.scopes.map((scope) => (
                        <li key={scope}><Badge tone="neutral">{scopeLabel(t, scope)}</Badge></li>
                      ))}
                    </ul>
                  </div>
                  <form action={revokeVoiceLinkAction}>
                    <input type="hidden" name="identityId" value={link.id} />
                    <button
                      type="submit"
                      aria-label={t("settingsPage.voiceAssistants.unlink", {
                        provider: PROVIDER_NAMES[link.provider],
                        name: names.get(link.memberId) ?? t("settingsPage.voiceAssistants.thisMember"),
                      })}
                      className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-risk)]"
                    >
                      <Unlink className="size-5" aria-hidden />
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--wh-foreground-muted)]">{t("settingsPage.voiceAssistants.unlinked")}</h2>
            <ul className="space-y-2 text-sm text-[var(--wh-foreground-muted)]">
              {past.map((link) => (
                <li key={link.id}>
                  {t("settingsPage.voiceAssistants.unlinkedRow", {
                    provider: PROVIDER_NAMES[link.provider],
                    name: names.get(link.memberId) ?? aMember,
                    date: link.revokedAt ? formatDate(household.timezone, link.revokedAt) : "",
                  })}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-3">
          <SectionHeader title={t("settingsPage.voiceAssistants.can")} />
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.voiceAssistants.canBody")}</p>
          <ul className="space-y-3">
            {VOICE_CHANNELS.map(({ channel, name }) => {
              const summary = channelSummary(channel);
              return (
                <li key={channel}>
                  <Card className="flex items-start gap-3">
                    <IconTile icon={AudioLines} tone="ai" />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">{name}</p>
                        <p className="text-xs text-[var(--wh-foreground-muted)]">{t(`settingsPage.voiceAssistants.where.${channel}`)}</p>
                      </div>
                      <CapabilityList title={t("settingsPage.voiceAssistants.list.available")} items={summary.available} channel={channel} t={t} />
                      <CapabilityList title={t("settingsPage.voiceAssistants.list.conditional")} items={summary.conditional} channel={channel} t={t} />
                      <CapabilityList title={t("settingsPage.voiceAssistants.list.appOnly")} items={summary.appOnly} channel={channel} t={t} />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <QuoteCard>{t("settingsPage.voiceAssistants.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
