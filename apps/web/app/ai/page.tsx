import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { currentSessionId, listMessages, type ConversationMessage } from "@wonderhome/core/conversation/repository";
import { listHouseholdPlaces } from "@wonderhome/core/homeplaces/repository";
import { englishNoticeKey } from "@wonderhome/core/conversation/reply-language";
import { requestT } from "@wonderhome/core/i18n/request";
import { listMembers, isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { childrenWithClasses, listActivities } from "@wonderhome/core/school/activities";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { loadVoiceSettings, speechKeySource } from "@wonderhome/core/voice/repository";
import { EmptyState } from "@wonderhome/core/ui/states";
import { Sparkles } from "lucide-react";

import { geminiFix, geminiLiveGate } from "../_lib/gemini-live";
import { homesendReviewLabels } from "../_lib/homesend-labels";
import { requireSession } from "../_lib/session";
import { Assistant, type AssistantMessage } from "./assistant";
import type { PlaceMark } from "./place-cards";
import { ConversationSearch } from "./conversation-search";
import { WelcomeVoice } from "./welcome-voice";
import { startWelcome } from "../_lib/hometalk-welcome";
import { assistantLabels, conversationSearchLabels } from "./hometalk-labels";

export const metadata = { title: "HomeTalk" };
export const dynamic = "force-dynamic";

/**
 * HomeTalk — talk or text, one conversation engine for both (module 04).
 *
 * The history is read here with the member's own client, so what reaches the
 * browser is what RLS lets this person see. New turns go through the API.
 */
export default async function AiPage({ searchParams }: { searchParams: Promise<{ q?: string; welcome?: string }> }) {
  const [{ q, welcome }, session] = await Promise.all([searchParams, requireSession("/ai")]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const timeStyle = { locale: locale.format.locale, hour12: locale.preferences.timeFormat === "12h" };
  const labels = assistantLabels(locale.t, timeStyle);

  // Everything the screen needs that does not depend on anything else, in one
  // wave: the plan, the voice settings, the family, where speech goes, whether
  // Gemini Live may run, this person's conversation and the place book. Right
  // after setup the welcome is written first, so its conversation is read
  // after it (below), never before.
  const householdId = membership.household.id;
  const welcoming = welcome === "1";
  const [entitlement, voiceEntitlement, voiceSettings, members, speechKey, gate, openSessionId, knownPlaces, activities] = await Promise.all([
    may(supabase, householdId, "conversation.text"),
    may(supabase, householdId, "conversation.voice"),
    loadVoiceSettings(supabase, householdId),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    speechKeySource(householdId).catch(() => "none" as const),
    geminiLiveGate(supabase, householdId),
    welcoming ? Promise.resolve(null) : currentSessionId(supabase, householdId, membership.memberId).catch(() => null),
    listHouseholdPlaces(supabase, householdId).catch(() => []),
    // Each child's own classes, for HomeSend's review: a class is picked, not typed (rule 20).
    listActivities(supabase, householdId).catch(() => []),
  ]);
  const kids = childrenWithClasses(members, activities);
  // A sustained, hands-free exchange is still voice underneath — gated the
  // same way tap-to-speak already is, and by the deployment's own rollout
  // flag (config/flags.ts: "flags gate rollout, never authorization").
  const liveConversationAvailable = flags().voice_conversation && voiceEntitlement.allowed;
  // Whether speech goes through a provider or stays in the browser. Both
  // have to be true: Google chosen with no key anywhere behind it would be
  // a control that does nothing.
  const serverVoice = voiceSettings.provider === "google" && speechKey !== "none";
  // Gemini Live only where the household chose it and the server agrees it
  // may run now — key, consent, plan and flag. Anything else is WonderHome's
  // own live loop, so the control never leads somewhere that cannot answer.
  // A member may switch engines in the composer; the household's setting is
  // where it starts. The token route re-checks all of this per session.
  const geminiAvailability = gate.availability;
  // Where it is off for a reason this person can change, the picker links straight to it and comes back here.
  const fix = geminiFix(geminiAvailability, { canManage: session.view.permissions.includes("household.manage"), returnTo: "/ai", t: locale.t });
  const geminiLive = geminiAvailability.available ? { available: true } : { available: false, reason: geminiAvailability.reason, ...(fix ? { fix } : {}) };
  const liveEngine = voiceSettings.liveEngine === "gemini_live" && geminiLive.available ? "gemini_live" : "wonderhome";

  let initialMessages: AssistantMessage[] = [];
  let placeMarks: Record<string, PlaceMark> = {};
  // Straight after setup: the welcome is written into the conversation once,
  // before the history is read, so it is simply the newest messages.
  const welcomeWords = entitlement.allowed && welcoming ? await startWelcome(supabase, membership).catch(() => null) : null;
  if (entitlement.allowed) {
    const sessionId = welcoming ? await currentSessionId(supabase, householdId, membership.memberId) : openSessionId;
    if (sessionId) {
      const history = await listMessages(supabase, householdId, sessionId, 30).catch(() => []);
      initialMessages = history
        .filter((message) => message.role !== "system")
        .map((message) => ({
          id: message.id,
          role: message.role as "member" | "assistant",
          text: shownText(message),
          at: message.createdAt.toISOString(),
          action: message.action ? { id: message.action.id, status: message.action.status, preview: message.action.preview, fingerprint: message.action.fingerprint ?? null, awaitingAdult: message.action.awaitingAdult ?? null } : null,
          places: message.places ?? null,
          amaf: message.amaf ?? null,
        }));
      if (initialMessages.some((message) => message.places && message.places.length > 0)) {
        placeMarks = Object.fromEntries(knownPlaces.map((place) => [place.placeId, place.status]));
      }
    }
  }

  return (
    <AppShell
      active="ai"
      viewer={viewer}
      secondary={secondary}
      pathname="/ai"
      title="HomeTalk"
      fill
      headerSearch={entitlement.allowed ? <ConversationSearch
            householdId={membership.household.id}
            timeZone={membership.household.timezone}
            labels={conversationSearchLabels(locale.t, timeStyle)}
          /> : undefined}
    >
      {welcomeWords ? (
        <WelcomeVoice householdId={membership.household.id} texts={welcomeWords} serverVoice={serverVoice} language={voiceSettings.language} label={locale.t("welcome.listen")} />
      ) : null}
      {entitlement.allowed ? (
        <Assistant
          householdId={membership.household.id}
          memberName={viewer.displayName}
          memberAvatarUrl={viewer.avatarUrl ?? null}
          firstName={viewer.displayName.split(" ")[0] ?? viewer.displayName}
          initialMessages={initialMessages}
          initialQuery={typeof q === "string" && q.trim() ? q.trim().slice(0, 500) : undefined}
          liveConversationAvailable={liveConversationAvailable}
          serverVoice={serverVoice}
          voiceLanguage={voiceSettings.language}
          liveEngine={liveEngine}
          geminiLive={geminiLive}
          kids={kids}
          needsAdult={membership.memberType !== "adult"}
          canAddChild={isHouseholdAdmin(membership)}
          timeZone={membership.household.timezone}
          labels={labels}
          homeSendLabels={homesendReviewLabels(locale.t, locale.preferences.language)}
          placeMarks={placeMarks}
        />
      ) : (
        <EmptyState
          icon={Sparkles}
          tone="ai"
          title={locale.t("hometalk.ui.notInPlan")}
          description={entitlement.reason}
        />
      )}
    </AppShell>
  );
}

/**
 * A reply as it was shown (story 22-005): the checked translation when there
 * was one, otherwise the validated English with the line saying why.
 */
function shownText(message: ConversationMessage): string {
  const shown = message.localized;
  if (!shown) return message.content;
  if (shown.text) return shown.text;
  const t = requestT();
  return `${message.content}\n\n${t(englishNoticeKey(shown.fallback))}`;
}
