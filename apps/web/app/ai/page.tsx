import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { currentSessionId, listMessages, type ConversationMessage } from "@wonderhome/core/conversation/repository";
import { englishNoticeKey } from "@wonderhome/core/conversation/reply-language";
import { requestT } from "@wonderhome/core/i18n/request";
import { listMembers, isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { loadVoiceSettings, speechKeySource } from "@wonderhome/core/voice/repository";
import { EmptyState } from "@wonderhome/core/ui/states";
import { Sparkles } from "lucide-react";

import { geminiLiveGate } from "../_lib/gemini-live";
import { requireSession } from "../_lib/session";
import { Assistant, type AssistantMessage } from "./assistant";
import { ConversationSearch } from "./conversation-search";
import { assistantLabels, conversationSearchLabels } from "./hometalk-labels";

export const metadata = { title: "HomeTalk" };
export const dynamic = "force-dynamic";

/**
 * HomeTalk — talk or text, one conversation engine for both (module 04).
 *
 * The history is read here with the member's own client, so what reaches the
 * browser is what RLS lets this person see. New turns go through the API.
 */
export default async function AiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, session] = await Promise.all([searchParams, requireSession("/ai")]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const timeStyle = { locale: locale.format.locale, hour12: locale.preferences.timeFormat === "12h" };
  const labels = assistantLabels(locale.t, timeStyle);

  const [entitlement, voiceEntitlement, voiceSettings, members] = await Promise.all([
    may(supabase, membership.household.id, "conversation.text"),
    may(supabase, membership.household.id, "conversation.voice"),
    loadVoiceSettings(supabase, membership.household.id),
    listMembers(supabase, membership.household.id, membership.household.ownerMemberId).catch(() => []),
  ]);
  const kids = members.filter((member) => member.memberType === "child").map((kid) => ({ id: kid.id, displayName: kid.displayName }));
  // A sustained, hands-free exchange is still voice underneath — gated the
  // same way tap-to-speak already is, and by the deployment's own rollout
  // flag (config/flags.ts: "flags gate rollout, never authorization").
  const liveConversationAvailable = flags().voice_conversation && voiceEntitlement.allowed;
  // Whether speech goes through a provider or stays in the browser. Both
  // have to be true: Google chosen with no key anywhere behind it would be
  // a control that does nothing.
  const serverVoice = voiceSettings.provider === "google" && (await speechKeySource(membership.household.id)) !== "none";
  // Gemini Live only where the household chose it and the server agrees it
  // may run now — key, consent, plan and flag. Anything else is WonderHome's
  // own live loop, so the control never leads somewhere that cannot answer.
  // A member may switch engines in the composer; the household's setting is
  // where it starts. The token route re-checks all of this per session.
  const geminiAvailability = (await geminiLiveGate(supabase, membership.household.id)).availability;
  const geminiLive = geminiAvailability.available ? { available: true } : { available: false, reason: geminiAvailability.reason };
  const liveEngine = voiceSettings.liveEngine === "gemini_live" && geminiLive.available ? "gemini_live" : "wonderhome";

  let initialMessages: AssistantMessage[] = [];
  if (entitlement.allowed) {
    const sessionId = await currentSessionId(supabase, membership.household.id, membership.memberId);
    if (sessionId) {
      const history = await listMessages(supabase, membership.household.id, sessionId, 30).catch(() => []);
      initialMessages = history
        .filter((message) => message.role !== "system")
        .map((message) => ({
          id: message.id,
          role: message.role as "member" | "assistant",
          text: shownText(message),
          at: message.createdAt.toISOString(),
          action: message.action ? { id: message.action.id, status: message.action.status, preview: message.action.preview, fingerprint: message.action.fingerprint ?? null } : null,
        }));
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
      {entitlement.allowed ? (
        <Assistant
          householdId={membership.household.id}
          memberName={viewer.displayName}
          firstName={viewer.displayName.split(" ")[0] ?? viewer.displayName}
          initialMessages={initialMessages}
          initialQuery={typeof q === "string" && q.trim() ? q.trim().slice(0, 500) : undefined}
          liveConversationAvailable={liveConversationAvailable}
          serverVoice={serverVoice}
          voiceLanguage={voiceSettings.language}
          liveEngine={liveEngine}
          geminiLive={geminiLive}
          kids={kids}
          canAddChild={isHouseholdAdmin(membership)}
          timeZone={membership.household.timezone}
          labels={labels}
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
