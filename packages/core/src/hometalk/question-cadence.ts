import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How often HomeTalk may start a question on WhatsApp (14-066, part 3; design
 * note principle 4): at most one an hour per person. Forwarding five photos
 * gets one question, with "3 quick ones" said once; the rest follow as the
 * person answers (each answer brings the next, `checking-questions.ts`), or
 * wait for HomeTalk in the app and the one grouped "questions waiting"
 * notice. In the app nothing is held: the person is there.
 *
 * Only a question opened because something was sent counts (`cadence:
 * "send"` on the message it was recorded with); the next question after an
 * answer is a reply, never counted.
 */

export type QuestionCadence = "send";

export const WHATSAPP_QUESTION_GAP_MS = 60 * 60 * 1000;

/** Whether a new question may be started now, given when the last one was. Pure. */
export function mayStartQuestion(lastStartedAt: Date | string | null | undefined, now: Date, gapMs = WHATSAPP_QUESTION_GAP_MS): boolean {
  if (!lastStartedAt) return true;
  const last = typeof lastStartedAt === "string" ? Date.parse(lastStartedAt) : lastStartedAt.getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= gapMs;
}

/**
 * When HomeTalk last started a question for this member on WhatsApp, within
 * the gap; null when none. Read with the service client the WhatsApp
 * processor already holds, scoped to the member's own WhatsApp sessions.
 * A read that fails answers null: the question is asked, as before.
 */
export async function lastQuestionStartedAt(admin: SupabaseClient, input: { householdId: string; memberId: string; now: Date }): Promise<string | null> {
  try {
    const { data: sessions } = await admin
      .from("conversation_sessions")
      .select("id")
      .eq("household_id", input.householdId)
      .eq("member_id", input.memberId)
      .eq("surface", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(5);
    const ids = ((sessions ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) return null;
    const { data } = await admin
      .from("conversation_messages")
      .select("created_at")
      .eq("household_id", input.householdId)
      .in("session_id", ids)
      .eq("role", "assistant")
      .eq("metadata->>cadence", "send")
      .gte("created_at", new Date(input.now.getTime() - WHATSAPP_QUESTION_GAP_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { created_at?: string } | null)?.created_at ?? null;
  } catch {
    return null;
  }
}
