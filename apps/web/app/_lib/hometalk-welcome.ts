import type { SupabaseClient } from "@supabase/supabase-js";

import { openSession, recordMessage, remember } from "@wonderhome/core/conversation/repository";
import { answerWelcome, WELCOME_TOPICS, welcomeOpening, type WelcomeHousehold, type WelcomeTopic } from "@wonderhome/core/conversation/welcome";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { listPets } from "@wonderhome/core/home/repository";
import { calledName } from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { preferencesOf } from "@wonderhome/core/i18n/preferences";
import { translatorFor } from "@wonderhome/core/i18n/translate";

/**
 * HomeTalk's welcome, on the server (task: the conversation after setup).
 *
 * `startWelcome` writes the opening into the person's HomeTalk conversation
 * once — the first time they arrive after finishing setup — and
 * `continueWelcome` answers the question it left waiting, from inside the
 * ordinary HomeTalk turn, so a typed, dictated or live answer all land here.
 * Every message's content is the English record; what the person reads is
 * kept beside it as the localized text, the same shape a translated reply
 * has, so history and summaries treat it like any other reply.
 */

type Admin = ReturnType<typeof createAdminClient>;

async function householdFor(supabase: SupabaseClient, membership: HouseholdMembership): Promise<WelcomeHousehold> {
  const [{ data }, pets] = await Promise.all([
    supabase
      .from("household_members")
      .select("id, display_name, nickname, nickname_preferred, member_type, created_at")
      .eq("household_id", membership.household.id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    listPets(supabase, membership.household.id).catch(() => []),
  ]);
  type Row = { id: string; display_name: string; nickname: string | null; nickname_preferred: boolean | null; member_type: string };
  const rows = (data as Row[] | null) ?? [];
  const named = (row: Row) => calledName({ displayName: row.display_name, nickname: row.nickname, nicknamePreferred: Boolean(row.nickname_preferred) });
  return {
    name: (membership.preferredName ?? membership.displayName).split(/\s+/)[0] ?? membership.displayName,
    people: rows.filter((row) => row.member_type !== "helper").map(named),
    helpers: rows.filter((row) => row.member_type === "helper").map(named),
    pets: pets.map((pet) => pet.name),
  };
}

function languageOf(membership: HouseholdMembership): string {
  return preferencesOf(membership.locale, membership.household.timezone).language;
}

/** Whether this person has already been welcomed, in any of their conversations. */
async function welcomed(admin: Admin, householdId: string, memberId: string): Promise<boolean> {
  const { data: sessions } = await admin.from("conversation_sessions").select("id").eq("household_id", householdId).eq("member_id", memberId);
  const ids = ((sessions as { id: string }[] | null) ?? []).map((row) => row.id);
  if (ids.length === 0) return false;
  const { count } = await admin.from("conversation_messages").select("id", { count: "exact", head: true }).in("session_id", ids).eq("metadata->>kind", "welcome");
  return (count ?? 0) > 0;
}

async function say(admin: Admin, input: { householdId: string; sessionId: string; english: string; shown: string; language: string; topic: WelcomeTopic | null }): Promise<string> {
  return recordMessage(admin, {
    householdId: input.householdId,
    sessionId: input.sessionId,
    role: "assistant",
    content: input.english,
    metadata: {
      kind: "welcome",
      welcome: { topic: input.topic },
      ...(input.language === "en" ? {} : { localized: { language: input.language, text: input.shown, fallback: null } }),
    },
  });
}

/**
 * The opening, written once: who we are and who you are, how to talk, the
 * first question. Returns the words to speak, or null when this person was
 * already welcomed (a second visit to the link changes nothing).
 */
export async function startWelcome(supabase: SupabaseClient, membership: HouseholdMembership): Promise<string[] | null> {
  const admin = createAdminClient();
  const householdId = membership.household.id;
  if (await welcomed(admin, householdId, membership.memberId)) return null;

  const language = languageOf(membership);
  const [household, t, english] = await Promise.all([householdFor(supabase, membership), translatorFor(language), translatorFor("en")]);
  const shown = welcomeOpening(t, language, household);
  const record = welcomeOpening(english, "en", household);
  const sessionId = await openSession(admin, { householdId, memberId: membership.memberId, channel: "text" });
  for (const [index, text] of shown.entries()) {
    const last = index === shown.length - 1;
    await say(admin, { householdId, sessionId, english: record[index]!, shown: text, language, topic: last ? WELCOME_TOPICS[0] : null });
  }
  return shown;
}

/** The welcome question the conversation is waiting on — only when it was the very last thing said. */
export async function pendingWelcome(admin: Admin, sessionId: string): Promise<WelcomeTopic | null> {
  const { data } = await admin
    .from("conversation_messages")
    .select("role, metadata")
    .eq("session_id", sessionId)
    .in("role", ["member", "assistant"])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = ((data as { role: string; metadata: Record<string, unknown> | null }[] | null) ?? [])[0];
  if (!row || row.role !== "assistant") return null;
  const topic = (row.metadata?.welcome as { topic?: unknown } | undefined)?.topic;
  return typeof topic === "string" && (WELCOME_TOPICS as readonly string[]).includes(topic) ? (topic as WelcomeTopic) : null;
}

/**
 * The answer to the waiting question: kept as the household's own words
 * (learned, for HomeBrain Review to confirm), then the next question
 * or the end. No model is asked anything.
 */
export async function continueWelcome(
  supabase: SupabaseClient,
  input: { membership: HouseholdMembership; sessionId: string; topic: WelcomeTopic; answer: string; channel: "text" | "voice"; transcriptConfidence?: number },
): Promise<{ memberMessageId: string; replyId: string; text: string }> {
  const admin = createAdminClient();
  const { membership, sessionId } = input;
  const householdId = membership.household.id;
  const language = languageOf(membership);
  const [household, t, english] = await Promise.all([householdFor(supabase, membership), translatorFor(language), translatorFor("en")]);
  const memberMessageId = await recordMessage(admin, {
    householdId,
    sessionId,
    role: "member",
    content: input.answer,
    transcriptConfidence: input.transcriptConfidence,
    metadata: { channel: input.channel, welcomeAnswer: input.topic },
  });
  const step = answerWelcome({ topic: input.topic, answer: input.answer, sessionId, household }, { t, language, english });
  if (step.memory) await remember(admin, householdId, step.memory, { memberId: membership.memberId, displayName: membership.displayName });
  const replyId = await say(admin, { householdId, sessionId, english: step.english, shown: step.reply, language, topic: step.topic });
  return { memberMessageId, replyId, text: step.reply };
}
