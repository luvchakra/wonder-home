import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";
import { describeSpeechSource, platformSpeechKey, resolveSpeechKey } from "@wonderhome/core/voice/platform-key";
import { loadVoiceSettings, voiceCredentialStatus } from "@wonderhome/core/voice/repository";
import { describeVoice } from "@wonderhome/core/voice/settings";
import { MicVocal, Sparkles } from "lucide-react";

import { removeVoiceKeyAction, saveVoice, saveVoiceKeyAction } from "../../(auth)/voice-actions";
import { VoiceSettingsForm } from "../../_components/voice-forms";
import { formatDate, requireSession } from "../../_lib/session";

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
export default async function VoiceSettingsPage() {
  const session = await requireSession("/settings/voice");
  const { supabase, membership, viewer, secondary } = session;
  const householdId = membership.household.id;

  const [settings, entitlement, credential] = await Promise.all([
    loadVoiceSettings(supabase, householdId),
    may(supabase, householdId, "conversation.voice"),
    voiceCredentialStatus(supabase, householdId),
  ]);

  // Whose key would answer, without reading either of them here: the
  // household's own if they set one, otherwise the deployment's.
  const keySource = resolveSpeechKey(credential.configured ? "configured" : null, platformSpeechKey()).source;
  const speechAvailable = keySource !== "none";
  const source = describeSpeechSource(keySource);

  const isAdmin = membership.roles.includes("head") || membership.roles.includes("administrator");
  const liveConversation = flags().voice_conversation;

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/voice"
      back={{ href: "/settings", label: "Back to settings" }}
      title="Voice"
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">How WonderHome sounds</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            The voice that answers you, and how carefully it listens back.
          </p>
        </header>

        {!entitlement.allowed ? (
          <EmptyState
            icon={Sparkles}
            tone="ai"
            title="Voice is not part of this plan"
            description={entitlement.reason}
          />
        ) : (
          <>
            <Card className="flex items-start gap-3">
              <IconTile icon={MicVocal} tone="ai" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Right now</p>
                <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{describeVoice(settings)}</p>
                {!liveConversation ? (
                  <p className="mt-2 text-xs text-[var(--wh-attention)]">
                    Live conversation is switched off for this deployment, so these settings apply to nothing yet.
                  </p>
                ) : null}
              </div>
            <Badge tone={settings.provider === "google" && speechAvailable ? "handled" : "neutral"}>
              {settings.provider === "google" && speechAvailable ? (keySource === "household" ? "Your key" : "Included") : "Browser"}
            </Badge>
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
              />
            ) : (
              <Card>
                <p className="text-sm text-[var(--wh-foreground-muted)]">
                  The Head of Family or an administrator sets the voice for everybody, so the whole household hears
                  the same one.
                </p>
              </Card>
            )}

            <QuoteCard>A home that listens properly.</QuoteCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
