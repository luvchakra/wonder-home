import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { currentSessionId, listMessages } from "@wonderhome/core/conversation/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { loadVoiceSettings, voiceCredentialStatus } from "@wonderhome/core/voice/repository";
import { EmptyState } from "@wonderhome/core/ui/states";
import { Sparkles } from "lucide-react";

import { requireSession } from "../_lib/session";
import { Assistant, type AssistantMessage } from "./assistant";

export const metadata = { title: "Talk to WonderHome" };
export const dynamic = "force-dynamic";

/**
 * Talk or text — one conversation engine for both (module 04).
 *
 * The history is read here with the member's own client, so what reaches the
 * browser is what RLS lets this person see. New turns go through the API.
 */
export default async function AiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, session] = await Promise.all([searchParams, requireSession("/ai")]);
  const { supabase, membership, viewer, secondary } = session;

  const [entitlement, voiceEntitlement, voiceSettings, voiceCredential] = await Promise.all([
    may(supabase, membership.household.id, "conversation.text"),
    may(supabase, membership.household.id, "conversation.voice"),
    loadVoiceSettings(supabase, membership.household.id),
    voiceCredentialStatus(supabase, membership.household.id),
  ]);
  // A sustained, hands-free exchange is still voice underneath — gated the
  // same way tap-to-speak already is, and by the deployment's own rollout
  // flag (config/flags.ts: "flags gate rollout, never authorization").
  const liveConversationAvailable = flags().voice_conversation && voiceEntitlement.allowed;
  // Whether speech goes through the household's own provider or stays in
  // the browser. Both have to be true: a provider chosen with no key
  // behind it would be a control that does nothing.
  const serverVoice = voiceSettings.provider === "google" && voiceCredential.configured;

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
          text: message.content,
          action: message.action ? { id: message.action.id, status: message.action.status, preview: message.action.preview } : null,
        }));
    }
  }

  return (
    <AppShell active="ai" viewer={viewer} secondary={secondary} pathname="/ai" title="Talk to WonderHome">
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
        />
      ) : (
        <EmptyState
          icon={Sparkles}
          tone="ai"
          title="Conversation is not part of this plan"
          description={entitlement.reason}
        />
      )}
    </AppShell>
  );
}
