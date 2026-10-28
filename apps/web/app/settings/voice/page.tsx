import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { platformSpeechKey, resolveSpeechKey } from "@wonderhome/core/voice/platform-key";
import { loadVoiceSettings, voiceCredentialStatus } from "@wonderhome/core/voice/repository";
import { AudioLines, ChevronRight, Lightbulb, MicVocal, Sparkles } from "lucide-react";
import Link from "next/link";

import { removeVoiceKeyAction, saveVoice, saveVoiceKeyAction } from "../../(auth)/voice-actions";
import { VoiceSettingsForm } from "../../_components/voice-forms";
import { ReturnLink, returnLabelKey } from "../../_components/return-link";
import { geminiFix, geminiLiveGate } from "../../_lib/gemini-live";
import { safeReturnTo } from "../../_lib/return-to";
import { formatDate, requireSession } from "../../_lib/session";
import { speechSourceWords, voiceFormLabels, voiceSummary } from "../../_lib/settings-labels";

export const metadata = { title: "Voice" };
export const dynamic = "force-dynamic";

/**
 * How WonderHome sounds, and how it listens (story 04-009).
 *
 * Three honest states, and the page says which one it is in rather than
 * offering controls that quietly do nothing (design rule 10):
 *
 *   - No plan for voice → say so, and offer nothing else.
 *   - No key anywhere → the browser's own voice, and the controls below
 *     dimmed with the reason given.
 *   - A key → every control, and a button that plays the result.
 *
 * Speech runs on WonderHome's own key by default, so a household needs no
 * Google account to be understood. The toggle is for the households that
 * want their own project behind it instead — their billing, their quotas,
 * their agreement with Google — and theirs wins when it is set.
 */
export default async function VoiceSettingsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const [query, session] = await Promise.all([searchParams, requireSession("/settings/voice")]);
  const returnTo = safeReturnTo(query.returnTo);
  const { supabase, membership, viewer, secondary } = session;
  const householdId = membership.household.id;

  const [settings, entitlement, credential, gemini] = await Promise.all([
    loadVoiceSettings(supabase, householdId),
    may(supabase, householdId, "conversation.voice"),
    voiceCredentialStatus(supabase, householdId),
    geminiLiveGate(supabase, householdId),
  ]);

  // Whose key would answer, without reading either of them here: the
  // household's own if they set one, otherwise the deployment's.
  const keySource = resolveSpeechKey(credential.configured ? "configured" : null, platformSpeechKey()).source;
  const speechAvailable = keySource !== "none";
  const { t, preferences } = session.locale;
  const source = speechSourceWords(t, keySource);

  const isAdmin = membership.roles.includes("head") || membership.roles.includes("administrator");
  // Who is really talking: Gemini Live in a conversation where the household
  // chose it and it can run; Google reading replies aloud only where a key
  // exists; otherwise the phone's own voice.
  const geminiTalks = settings.liveEngine === "gemini_live" && gemini.availability.available;
  const googleSpeaks = settings.provider === "google" && speechAvailable;
  const liveConversation = flags().voice_conversation;

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/voice"
      back={{ href: "/settings", label: t("settingsPage.backToSettings") }}
      title={t("settingsPage.voice.title")}
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.voice.heading")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.voice.lede")}</p>
        </header>
        {returnTo ? <ReturnLink href={returnTo} label={t(returnLabelKey(returnTo))} /> : null}

        {!entitlement.allowed ? (
          <EmptyState
            icon={Sparkles}
            tone="ai"
            title={t("settingsPage.voice.notInPlan")}
            description={entitlement.reason}
          />
        ) : (
          <>
            {/* What is actually speaking, never what a setting would choose
                if a service were there (the owner, 2026-10-18: it said
                "WaveNet … Browser" while Gemini was the voice). */}
            {/* What happens today, in two plain sentences (the owner, 2026-10-21: "made simple to understand"). */}
            <Card className="flex items-start gap-3">
              <IconTile icon={geminiTalks ? AudioLines : MicVocal} tone="ai" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("settingsPage.voice.rightNow")}</p>
                <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
                  {geminiTalks ? t("settingsPage.voice.simple.summaryGemini") : t("settingsPage.voice.simple.summaryWonderHome")}{" "}
                  {!settings.speakReplies
                    ? t("settingsPage.voice.simple.hearOff")
                    : googleSpeaks
                      ? t("settingsPage.voice.simple.hearGoogle", { voice: voiceSummary(t, settings, preferences.language) })
                      : t("settingsPage.voice.simple.hearPhone")}
                </p>
                {!liveConversation ? <p className="mt-2 text-xs text-[var(--wh-attention)]">{t("settingsPage.voice.liveOff")}</p> : null}
              </div>
              <Badge tone={geminiTalks || googleSpeaks ? "handled" : "neutral"}>
                {geminiTalks
                  ? t("settingsPage.voice.badge.gemini")
                  : googleSpeaks
                    ? keySource === "household"
                      ? t("settingsPage.badge.yourKey")
                      : t("settingsPage.badge.included")
                    : t("settingsPage.voice.badge.browser")}
              </Badge>
            </Card>

            {/* The how-to, folded: worth a look once, not on every visit. */}
            <Card className="p-2">
              <ul>
              <ExpandableRow
                summary={
                  <>
                    <IconTile icon={Lightbulb} tone="primary" size="sm" />
                    <span className="min-w-0 flex-1 text-sm font-semibold">{t("settingsPage.voice.simple.howToUse")}</span>
                  </>
                }
              >
                <ul className="space-y-1.5 text-sm text-[var(--wh-foreground-muted)]">
                  <li>{t("settingsPage.voice.use.start")}</li>
                  <li>{t("settingsPage.voice.use.act")}</li>
                  <li>{t("settingsPage.voice.use.float")}</li>
                </ul>
                <Link href="/settings/connections#voice" className="mt-2 flex min-h-11 items-center justify-between gap-2 rounded-[var(--wh-radius-sm)] text-sm font-semibold text-[var(--wh-primary)]">
                  {t("settingsPage.voice.use.alexa")}
                  <ChevronRight aria-hidden className="size-4" />
                </Link>
              </ExpandableRow>
              </ul>
            </Card>

            {isAdmin ? (
              <VoiceSettingsForm
                householdId={householdId}
                settings={settings}
                save={saveVoice}
                saveKey={saveVoiceKeyAction}
                removeKey={removeVoiceKeyAction}
                speechAvailable={speechAvailable}
                ownKey={credential.configured}
                ownKeySetOn={credential.updatedAt ? formatDate(membership.household.timezone, credential.updatedAt) : null}
                sourceTitle={source.title}
                sourceDetail={source.detail}
                geminiLive={{
                  available: gemini.availability.available,
                  reason: gemini.availability.available ? null : gemini.availability.reason,
                  fix: geminiFix(gemini.availability, { canManage: isAdmin, returnTo: "/settings/voice", t }),
                }}
                labels={voiceFormLabels(t, preferences.language)}
              />
            ) : (
              <Card>
                <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.voice.adminSets")}</p>
              </Card>
            )}

            <QuoteCard>{t("settingsPage.voice.quote")}</QuoteCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
