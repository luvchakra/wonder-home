import type { SupabaseClient } from "@supabase/supabase-js";

import { categoryFor, CURATED_CARDS, curatedCard, TRIVIA_CATEGORIES, type TriviaCategory } from "./trivia-curated";
import {
  clampLevel,
  defaultLevel,
  quizStreak,
  TRIVIA_HISTORY_FOR_GUARDIAN,
  TRIVIA_REJECT_REASONS,
  type NormalisedTopic,
  type ShownCard,
  type TopicCards,
  type TriviaBand,
  type TriviaCard,
  type TriviaLevel,
  type TriviaRejectReason,
} from "./trivia";

/**
 * Kids Trivia on the database (story 08-034). Reads go through the person's
 * own session, so row-level security decides who sees a child's topics and
 * history (the child, their guardians, the household's Admins). Topics, cards
 * shown, answers and turned-away topics are written by the server after its
 * own checks (`trivia-actions.ts`), with the service role: a session has no
 * insert right on those tables, so the safety check cannot be stepped round.
 */

/** A built-in category stands in for a topic as "cat:<category>". */
export const CATEGORY_TOPIC = "cat:";

export type TriviaTopic = { id: string; label: string; key: string };

export type ChildTrivia = {
  enabled: boolean;
  level: TriviaLevel;
  topics: TriviaTopic[];
  /** Newest first, at most 60. */
  history: (ShownCard & { id: string })[];
};

const HISTORY_LIMIT = 60;

/** A child's Trivia as they see it. Null when the tables are not there yet (a database before the migration): no card. */
export async function loadChildTrivia(supabase: SupabaseClient, householdId: string, memberId: string, band: TriviaBand): Promise<ChildTrivia | null> {
  const [profile, topics, history] = await Promise.all([
    supabase.from("trivia_profiles").select("enabled, level").eq("member_id", memberId).eq("household_id", householdId).maybeSingle(),
    supabase.from("trivia_topics").select("id, label, topic_key").eq("household_id", householdId).eq("member_id", memberId).order("created_at").limit(20),
    supabase
      .from("trivia_shown")
      .select("id, item_key, kind, topic, answered_correct")
      .eq("household_id", householdId)
      .eq("member_id", memberId)
      .order("shown_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  if (profile.error || topics.error || history.error) return null;
  const row = profile.data as { enabled: boolean; level: number } | null;
  return {
    enabled: row?.enabled ?? true,
    level: row ? clampLevel(row.level) : defaultLevel(band),
    topics: ((topics.data ?? []) as { id: string; label: string; topic_key: string }[]).map((topic) => ({ id: topic.id, label: topic.label, key: topic.topic_key })),
    history: ((history.data ?? []) as { id: string; item_key: string; kind: "fact" | "quiz"; topic: string; answered_correct: boolean | null }[]).map((shown) => ({
      id: shown.id,
      key: shown.item_key,
      kind: shown.kind,
      topic: shown.topic,
      answeredCorrect: shown.answered_correct,
    })),
  };
}

/**
 * The cards each of the child's topics can draw on, in their order. A topic no
 * built-in category covers has none of its own yet; when none of the child's
 * topics has any (or they have none), every category is offered under its own
 * name, so the card is never empty and never pretends to be about their topic.
 */
export function topicCardsFor(topics: readonly TriviaTopic[]): { topics: TopicCards[]; uncovered: string[] } {
  const covered: TopicCards[] = [];
  const uncovered: string[] = [];
  const used = new Set<TriviaCategory>();
  for (const topic of topics) {
    const category = categoryFor(topic.key);
    if (!category) {
      uncovered.push(topic.label);
      continue;
    }
    used.add(category);
    covered.push({ topic: topic.label, cards: CURATED_CARDS[category] });
  }
  if (covered.length > 0) return { topics: covered, uncovered };
  return { topics: TRIVIA_CATEGORIES.map((category) => ({ topic: `${CATEGORY_TOPIC}${category}`, cards: CURATED_CARDS[category] })), uncovered };
}

/** A card by its key, wherever it came from. */
export function cardByKey(key: string): TriviaCard | null {
  return curatedCard(key);
}

/** The topic a card may be recorded under for this child: one of their topics, or a built-in category. */
export function allowedTopic(topic: string, topics: readonly TriviaTopic[]): boolean {
  if (topic.startsWith(CATEGORY_TOPIC)) return (TRIVIA_CATEGORIES as readonly string[]).includes(topic.slice(CATEGORY_TOPIC.length));
  return topics.some((own) => own.label === topic);
}

export async function recordShown(admin: SupabaseClient, input: { householdId: string; memberId: string; card: TriviaCard; topic: string }): Promise<string> {
  const { data, error } = await admin
    .from("trivia_shown")
    .insert({ household_id: input.householdId, member_id: input.memberId, item_key: input.card.key, kind: input.card.kind, topic: input.topic.slice(0, 40), text: input.card.text })
    .select("id")
    .single();
  if (error) throw new Error(`trivia recordShown failed: ${error.code ?? "unknown"}`);
  return (data as { id: string }).id;
}

/**
 * The child's answer to a quiz they were shown. Counted once: a second answer
 * to the same card changes nothing. The card's own answer decides, never the
 * browser's.
 */
export async function recordAnswer(
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; shownId: string; choice: number },
): Promise<{ correct: boolean; answer: number; streak: number } | null> {
  const { data } = await admin
    .from("trivia_shown")
    .select("item_key, kind, answered_correct")
    .eq("id", input.shownId)
    .eq("household_id", input.householdId)
    .eq("member_id", input.memberId)
    .maybeSingle();
  const row = data as { item_key: string; kind: string; answered_correct: boolean | null } | null;
  if (!row || row.kind !== "quiz") return null;
  const card = cardByKey(row.item_key);
  if (!card || card.answer === undefined) return null;
  const correct = input.choice === card.answer;
  if (row.answered_correct === null) {
    await admin.from("trivia_shown").update({ answered_correct: correct }).eq("id", input.shownId).is("answered_correct", null);
  }
  const { data: recent } = await admin
    .from("trivia_shown")
    .select("item_key, kind, topic, answered_correct")
    .eq("household_id", input.householdId)
    .eq("member_id", input.memberId)
    .order("shown_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = ((recent ?? []) as { item_key: string; kind: "fact" | "quiz"; topic: string; answered_correct: boolean | null }[]).map((shown) => ({
    key: shown.item_key,
    kind: shown.kind,
    topic: shown.topic,
    answeredCorrect: shown.answered_correct,
  }));
  return { correct: row.answered_correct ?? correct, answer: card.answer, streak: quizStreak(history) };
}

export async function addTopic(admin: SupabaseClient, input: { householdId: string; memberId: string; topic: NormalisedTopic; checkedBy: "rules" | "model" }): Promise<TriviaTopic> {
  const { data, error } = await admin
    .from("trivia_topics")
    .upsert(
      { household_id: input.householdId, member_id: input.memberId, label: input.topic.label, topic_key: input.topic.key, checked_by: input.checkedBy },
      { onConflict: "member_id,topic_key", ignoreDuplicates: false },
    )
    .select("id, label, topic_key")
    .single();
  if (error) throw new Error(`trivia addTopic failed: ${error.code ?? "unknown"}`);
  const row = data as { id: string; label: string; topic_key: string };
  return { id: row.id, label: row.label, key: row.topic_key };
}

/** A turned-away topic: only its hash and the reason, never its words. */
export async function recordRejection(admin: SupabaseClient, input: { householdId: string; memberId: string; hash: string; reason: TriviaRejectReason }): Promise<void> {
  await admin.from("trivia_rejections").insert({ household_id: input.householdId, member_id: input.memberId, topic_hash: input.hash, reason: input.reason });
}

/** The child removes their own; a guardian or an Admin removes any of the child's (RLS decides). */
export async function removeTopic(supabase: SupabaseClient, input: { householdId: string; topicId: string }): Promise<boolean> {
  const { data, error } = await supabase.from("trivia_topics").delete().eq("id", input.topicId).eq("household_id", input.householdId).select("id");
  if (error) throw new Error(`trivia removeTopic failed: ${error.code ?? "unknown"}`);
  return (data ?? []).length > 0;
}

/** The child's "too hard / too easy". */
export async function saveLevel(supabase: SupabaseClient, input: { householdId: string; memberId: string; level: TriviaLevel }): Promise<void> {
  const { error } = await supabase
    .from("trivia_profiles")
    .upsert({ household_id: input.householdId, member_id: input.memberId, level: input.level, updated_at: new Date().toISOString() }, { onConflict: "member_id" });
  if (error) throw new Error(`trivia saveLevel failed: ${error.code ?? "unknown"}`);
}

/** On or off for a child: a guardian's or an Admin's (RLS and the table's trigger decide). */
export async function saveEnabled(supabase: SupabaseClient, input: { householdId: string; memberId: string; enabled: boolean }): Promise<void> {
  const { data: existing } = await supabase.from("trivia_profiles").select("member_id").eq("member_id", input.memberId).eq("household_id", input.householdId).maybeSingle();
  const now = new Date().toISOString();
  const { error } = existing
    ? await supabase.from("trivia_profiles").update({ enabled: input.enabled, updated_at: now }).eq("member_id", input.memberId).eq("household_id", input.householdId)
    : await supabase.from("trivia_profiles").insert({ household_id: input.householdId, member_id: input.memberId, enabled: input.enabled, updated_at: now });
  if (error) throw new Error(error.code === "42501" ? "trivia_forbidden" : `trivia saveEnabled failed: ${error.code ?? "unknown"}`);
}

export type GuardianTrivia = {
  enabled: boolean;
  topics: TriviaTopic[];
  recent: { kind: "fact" | "quiz"; topic: string; text: string; answeredCorrect: boolean | null; shownAt: string }[];
  /** Topics turned away in the last 30 days, by reason (words never kept). */
  turnedAway: Partial<Record<TriviaRejectReason, number>>;
};

/** What a guardian or an Admin sees of each child's Trivia: on/off, topics, the last 20 cards and how many topics were turned away. */
export async function loadGuardianTrivia(supabase: SupabaseClient, householdId: string, childIds: readonly string[]): Promise<Map<string, GuardianTrivia>> {
  const out = new Map<string, GuardianTrivia>();
  if (childIds.length === 0) return out;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [profiles, topics, shown, rejections] = await Promise.all([
    supabase.from("trivia_profiles").select("member_id, enabled").eq("household_id", householdId).in("member_id", childIds),
    supabase.from("trivia_topics").select("id, member_id, label, topic_key").eq("household_id", householdId).in("member_id", childIds).order("created_at").limit(20 * childIds.length),
    // The newest 20 per child: read a bounded window, then keep 20 each.
    supabase
      .from("trivia_shown")
      .select("member_id, kind, topic, text, answered_correct, shown_at")
      .eq("household_id", householdId)
      .in("member_id", childIds)
      .order("shown_at", { ascending: false })
      .limit(TRIVIA_HISTORY_FOR_GUARDIAN * childIds.length * 3),
    supabase.from("trivia_rejections").select("member_id, reason").eq("household_id", householdId).in("member_id", childIds).gte("created_at", since).limit(200),
  ]);
  if (profiles.error || topics.error || shown.error) return out;
  for (const id of childIds) out.set(id, { enabled: true, topics: [], recent: [], turnedAway: {} });
  for (const row of (profiles.data ?? []) as { member_id: string; enabled: boolean }[]) out.get(row.member_id)!.enabled = row.enabled;
  for (const row of (topics.data ?? []) as { id: string; member_id: string; label: string; topic_key: string }[]) out.get(row.member_id)?.topics.push({ id: row.id, label: row.label, key: row.topic_key });
  for (const row of (shown.data ?? []) as { member_id: string; kind: "fact" | "quiz"; topic: string; text: string; answered_correct: boolean | null; shown_at: string }[]) {
    const child = out.get(row.member_id);
    if (child && child.recent.length < TRIVIA_HISTORY_FOR_GUARDIAN) child.recent.push({ kind: row.kind, topic: row.topic, text: row.text, answeredCorrect: row.answered_correct, shownAt: row.shown_at });
  }
  for (const row of (rejections.data ?? []) as { member_id: string; reason: string }[]) {
    const child = out.get(row.member_id);
    if (child && (TRIVIA_REJECT_REASONS as readonly string[]).includes(row.reason)) {
      const reason = row.reason as TriviaRejectReason;
      child.turnedAway[reason] = (child.turnedAway[reason] ?? 0) + 1;
    }
  }
  return out;
}
