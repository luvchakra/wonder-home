"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { ageBandFor, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { requireMembership } from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { hitRateLimit } from "@wonderhome/core/security/rate-limit";
import { adjustLevel, looksLikeInstruction, normaliseTopic, pickNextCard, quizStreak, topicHash, TRIVIA_TOPICS_PER_CHILD, triviaBand, type PickMode } from "@wonderhome/core/school/trivia";
import {
  addTopic,
  allowedTopic,
  cardByKey,
  loadChildTrivia,
  recordAnswer,
  recordRejection,
  recordShown,
  removeTopic,
  saveEnabled,
  saveLevel,
  topicCardsFor,
} from "@wonderhome/core/school/trivia-repository";
import { decideTopic, triviaJudgeFor } from "@wonderhome/core/school/trivia-safety";

import { toTriviaView, type TriviaView } from "../_lib/trivia-view";

/**
 * Kids Trivia (story 08-034). A child adds and removes their own topics, gets
 * the next card, answers a quiz and says "too hard" or "too easy"; a guardian
 * or an Admin removes a child's topic and turns Trivia off for them. Every
 * check is made here, on the server: who is asking, the topic's safety (the
 * rules, then the household's model), and a card's right answer. A topic that
 * is turned away is never stored — only a hash and a reason code — and the
 * child is told only "Let's pick another topic".
 */

type Session = { supabase: Awaited<ReturnType<typeof createClient>>; actor: HouseholdMembership };

async function asChild(householdId: string): Promise<Session | null> {
  const supabase = await createClient();
  const actor = await requireMembership(supabase, householdId);
  return actor.memberType === "child" ? { supabase, actor } : null;
}

const bandOf = (actor: HouseholdMembership) => triviaBand(ageBandFor(parseDateOfBirth(actor.dateOfBirth ?? "")));

export type TopicResult = { ok: true; topic: { id: string; label: string } } | { ok: false; error: "pick_another" | "too_long" | "too_many" | "slow_down" | "off" | "failed" };

export async function addTriviaTopicAction(input: { householdId: string; topic: string }): Promise<TopicResult> {
  const parsed = z.object({ householdId: z.uuid(), topic: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "too_long" };
  try {
    const session = await asChild(parsed.data.householdId);
    if (!session) return { ok: false, error: "failed" };
    const { supabase, actor } = session;
    const householdId = parsed.data.householdId;
    const band = bandOf(actor);
    const topic = normaliseTopic(parsed.data.topic);
    if (!topic) {
      // An instruction typed as a topic is turned away like an unfit one, and kept only as a hash.
      if (!looksLikeInstruction(parsed.data.topic)) return { ok: false, error: "too_long" };
      const key = parsed.data.topic.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
      await recordRejection(createAdminClient(), { householdId, memberId: actor.memberId, hash: topicHash(householdId, key), reason: "not_a_topic" }).catch(() => undefined);
      return { ok: false, error: "pick_another" };
    }
    const current = await loadChildTrivia(supabase, householdId, actor.memberId, band);
    if (!current) return { ok: false, error: "failed" };
    if (!current.enabled) return { ok: false, error: "off" };
    const already = current.topics.find((own) => own.key === topic.key);
    if (already) return { ok: true, topic: { id: already.id, label: already.label } };
    if (current.topics.length >= TRIVIA_TOPICS_PER_CHILD) return { ok: false, error: "too_many" };
    const admin = createAdminClient();
    if (!(await hitRateLimit(admin, "trivia.topic", actor.memberId))) return { ok: false, error: "slow_down" };
    const decision = await decideTopic(topic, band, await triviaJudgeFor(admin, householdId));
    if (!decision.ok) {
      await recordRejection(admin, { householdId, memberId: actor.memberId, hash: topicHash(householdId, topic.key), reason: decision.reason }).catch(() => undefined);
      return { ok: false, error: "pick_another" };
    }
    const saved = await addTopic(admin, { householdId, memberId: actor.memberId, topic, checkedBy: decision.checkedBy });
    revalidatePath("/");
    return { ok: true, topic: { id: saved.id, label: saved.label } };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** The child removes their own topic; a guardian or an Admin removes any of a child's (RLS decides). */
export async function removeTriviaTopicAction(input: { householdId: string; topicId: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ householdId: z.uuid(), topicId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const removed = await removeTopic(supabase, parsed.data);
    revalidatePath("/");
    revalidatePath("/family");
    return { ok: removed };
  } catch {
    return { ok: false };
  }
}

/** The card the Home shows was seen: on record, so it is not shown again next. Returns its id, for an answer. */
export async function triviaShownAction(input: { householdId: string; cardKey: string; topic: string }): Promise<{ shownId: string | null }> {
  const parsed = z.object({ householdId: z.uuid(), cardKey: z.string().min(3).max(80), topic: z.string().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return { shownId: null };
  try {
    const session = await asChild(parsed.data.householdId);
    if (!session) return { shownId: null };
    const card = cardByKey(parsed.data.cardKey);
    const current = await loadChildTrivia(session.supabase, parsed.data.householdId, session.actor.memberId, bandOf(session.actor));
    if (!card || !current?.enabled || !allowedTopic(parsed.data.topic, current.topics)) return { shownId: null };
    // A reload shows the same card: one record, not two.
    const last = current.history[0];
    if (last && last.key === card.key) return { shownId: last.id };
    const shownId = await recordShown(createAdminClient(), { householdId: parsed.data.householdId, memberId: session.actor.memberId, card, topic: parsed.data.topic });
    return { shownId };
  } catch {
    return { shownId: null };
  }
}

/** "Tell me another" or "Next topic": the next card, already on record. */
export async function triviaNextAction(input: { householdId: string; mode: PickMode }): Promise<{ ok: true; view: TriviaView } | { ok: false }> {
  const parsed = z.object({ householdId: z.uuid(), mode: z.enum(["another", "next_topic"]) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const session = await asChild(parsed.data.householdId);
    if (!session) return { ok: false };
    const { supabase, actor } = session;
    const current = await loadChildTrivia(supabase, parsed.data.householdId, actor.memberId, bandOf(actor));
    if (!current?.enabled) return { ok: false };
    const { topics, uncovered } = topicCardsFor(current.topics);
    const pick = pickNextCard({ topics, history: current.history, level: current.level, mode: parsed.data.mode, seed: `${actor.memberId}:${Date.now()}` });
    if (!pick) return { ok: false };
    const shownId = await recordShown(createAdminClient(), { householdId: parsed.data.householdId, memberId: actor.memberId, card: pick.card, topic: pick.topic });
    return { ok: true, view: toTriviaView({ pick, shownId, uncovered, streak: quizStreak(current.history), level: current.level }) };
  } catch {
    return { ok: false };
  }
}

export async function triviaAnswerAction(input: { householdId: string; shownId: string; choice: number }): Promise<{ ok: true; correct: boolean; answer: number; streak: number } | { ok: false }> {
  const parsed = z.object({ householdId: z.uuid(), shownId: z.uuid(), choice: z.number().int().min(0).max(3) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const session = await asChild(parsed.data.householdId);
    if (!session) return { ok: false };
    const result = await recordAnswer(createAdminClient(), { householdId: parsed.data.householdId, memberId: session.actor.memberId, shownId: parsed.data.shownId, choice: parsed.data.choice });
    return result ? { ok: true, ...result } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function triviaLevelAction(input: { householdId: string; feedback: "too_hard" | "too_easy" }): Promise<{ ok: true; level: number } | { ok: false }> {
  const parsed = z.object({ householdId: z.uuid(), feedback: z.enum(["too_hard", "too_easy"]) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const session = await asChild(parsed.data.householdId);
    if (!session) return { ok: false };
    const current = await loadChildTrivia(session.supabase, parsed.data.householdId, session.actor.memberId, bandOf(session.actor));
    if (!current) return { ok: false };
    const level = adjustLevel(current.level, parsed.data.feedback);
    await saveLevel(session.supabase, { householdId: parsed.data.householdId, memberId: session.actor.memberId, level });
    return { ok: true, level };
  } catch {
    return { ok: false };
  }
}

/** A guardian or an Admin turns Trivia on or off for a child (RLS and the table's trigger decide who may). */
export async function triviaEnabledAction(input: { householdId: string; childId: string; enabled: boolean }): Promise<{ ok: boolean }> {
  const parsed = z.object({ householdId: z.uuid(), childId: z.uuid(), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    if (actor.memberType === "child") return { ok: false };
    await saveEnabled(supabase, { householdId: parsed.data.householdId, memberId: parsed.data.childId, enabled: parsed.data.enabled });
    revalidatePath("/family");
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
