import type { SupabaseClient } from "@supabase/supabase-js";

import { embedderFor, fromVectorLiteral, toVectorLiteral, type Embedder } from "../homebrain/sleep/embeddings";
import type { ValidatedDecision } from "./decision";

/**
 * HomeSend's decision memory (14-083, owner 2026-11-22: "learnt over time to
 * take the right decision in automated way"). Every decision is remembered
 * with what people did next; on a new item the household's own most similar
 * past decisions are handed to the model as worked examples, so a correction
 * steers the next decision without code changes. Never across households:
 * every read and write names the household, and RLS holds it to the
 * member's own. No amount and no approval is kept: an operation is its
 * capability, op, title and confidence only.
 */

export const DECISION_OUTCOMES = ["pending", "kept", "confirmed", "corrected", "undone", "answered"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export type DecisionCorrection = { field: string; to: string };

export type DecisionMemory = {
  id: string;
  intakeId: string;
  senderMemberId: string | null;
  senderKey: string | null;
  title: string;
  whatIs: string | null;
  nearestKind: string;
  newKind: string | null;
  decision: { capability: string; op: string; title: string; confidence: number }[];
  outcome: DecisionOutcome;
  corrections: DecisionCorrection[];
  embedding: number[] | null;
  createdAt: string;
};

/** How many past decisions are read, and how many are handed over. */
const READ_LIMIT = 200;
export const EXAMPLES_K = 5;

/** A table not live yet, or not in PostgREST's cache: no memory, never an error. */
function missingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42703" || error?.code === "PGRST204";
}

const WORD = /[\p{L}\p{N}]{3,}/gu;
const tokens = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).slice(0, 80));

/** What an item is known by, for matching: its title and what it is. */
export function memoryText(title: string, whatIs: string | null): string {
  return [title, whatIs].filter(Boolean).join(" — ").slice(0, 400);
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const word of a) if (b.has(word)) both += 1;
  return both / (a.size + b.size - both);
}

export type SimilarQuery = { text: string; senderMemberId: string | null; senderKey: string | null; embedding?: number[] | null };

/**
 * How alike a past decision is: meaning (embedding, when both have one) or
 * words, plus the same sender. A pending decision says nothing yet, so it
 * ranks below one people acted on.
 */
export function similarity(query: SimilarQuery, memory: DecisionMemory): number {
  const meaning = query.embedding && memory.embedding ? Math.max(0, cosine(query.embedding, memory.embedding)) : jaccard(tokens(query.text), tokens(memoryText(memory.title, memory.whatIs)));
  const sameSender = (query.senderMemberId && query.senderMemberId === memory.senderMemberId) || (query.senderKey && query.senderKey === memory.senderKey) ? 0.15 : 0;
  const acted = memory.outcome === "pending" ? 0 : 0.05;
  return meaning + sameSender + acted;
}

/** The k most similar, above a floor so an unrelated item is never an example. */
export function mostSimilar(query: SimilarQuery, memories: readonly DecisionMemory[], k = EXAMPLES_K): DecisionMemory[] {
  return memories
    .map((memory) => ({ memory, score: similarity(query, memory) }))
    .filter((entry) => entry.score >= 0.3)
    .sort((a, b) => b.score - a.score || b.memory.createdAt.localeCompare(a.memory.createdAt))
    .slice(0, k)
    .map((entry) => entry.memory);
}

const OUTCOME_WORDS: Record<DecisionOutcome, string> = {
  pending: "nobody has acted on it yet",
  kept: "the household kept it",
  confirmed: "the household confirmed it",
  corrected: "the household corrected it",
  undone: "the household undid it — do not decide this way again",
  answered: "the household answered its question",
};

/** The worked examples, as the model reads them: no ids, no names of people, no amounts. */
export function examplesText(memories: readonly DecisionMemory[]): string {
  return memories
    .map((memory, index) => {
      const ops = memory.decision.map((op) => `${op.op} ${op.capability} "${op.title}"`).join("; ") || "nothing recorded";
      const fixes = memory.corrections.length > 0 ? ` Corrected: ${memory.corrections.map((fix) => `${fix.field} → ${fix.to}`).join(", ")}.` : "";
      return `Example ${index + 1}: "${memory.title}"${memory.newKind ? ` (a ${memory.newKind})` : ` (${memory.nearestKind})`} → ${ops}; ${OUTCOME_WORDS[memory.outcome]}.${fixes}`;
    })
    .join("\n");
}

function asMemory(row: Record<string, unknown>): DecisionMemory {
  return {
    id: String(row.id),
    intakeId: String(row.intake_id),
    senderMemberId: (row.sender_member_id as string | null) ?? null,
    senderKey: (row.sender_key as string | null) ?? null,
    title: String(row.title),
    whatIs: (row.what_is as string | null) ?? null,
    nearestKind: String(row.nearest_kind),
    newKind: (row.new_kind as string | null) ?? null,
    decision: Array.isArray(row.decision) ? (row.decision as DecisionMemory["decision"]) : [],
    outcome: (DECISION_OUTCOMES as readonly string[]).includes(row.outcome as string) ? (row.outcome as DecisionOutcome) : "pending",
    corrections: Array.isArray(row.corrections) ? (row.corrections as DecisionCorrection[]) : [],
    embedding: fromVectorLiteral(row.embedding),
    createdAt: String(row.created_at),
  };
}

const COLUMNS = "id, intake_id, sender_member_id, sender_key, title, what_is, nearest_kind, new_kind, decision, outcome, corrections, embedding, created_at";

/** The household's recent decisions, newest first, bounded. */
export async function recentDecisions(client: SupabaseClient, householdId: string): Promise<DecisionMemory[]> {
  const { data, error } = await client.from("homesend_decision_memories").select(COLUMNS).eq("household_id", householdId).order("created_at", { ascending: false }).limit(READ_LIMIT);
  if (error) {
    if (missingTable(error)) return [];
    throw new Error(`recentDecisions failed: ${error.code ?? "unknown"}`);
  }
  return ((data ?? []) as Record<string, unknown>[]).map(asMemory);
}

async function embed(householdId: string, text: string, purpose: "document" | "query", embedder?: Embedder | null): Promise<{ vector: number[]; model: string } | null> {
  const using = embedder === undefined ? await embedderFor(householdId).catch(() => null) : embedder;
  if (!using) return null;
  const vectors = await using.embed([text], purpose).catch(() => null);
  const vector = vectors?.[0];
  return vector ? { vector, model: using.model } : null;
}

/** The household's most similar past decisions for a new item, as worked examples. Never throws: no memory is no examples. */
export async function similarDecisions(client: SupabaseClient, householdId: string, query: Omit<SimilarQuery, "embedding">, embedder?: Embedder | null): Promise<DecisionMemory[]> {
  try {
    const memories = await recentDecisions(client, householdId);
    if (memories.length === 0) return [];
    const embedded = memories.some((memory) => memory.embedding) ? await embed(householdId, query.text, "query", embedder) : null;
    return mostSimilar({ ...query, embedding: embedded?.vector ?? null }, memories);
  } catch {
    return [];
  }
}

/** A decision, compact: capability, op, title and confidence; never an amount, a person or an approval. */
export function compactDecision(decision: ValidatedDecision): DecisionMemory["decision"] {
  return decision.accepted.flatMap((index) => {
    const op = decision.operations[index];
    return op ? [{ capability: op.capability, op: op.op, title: String(op.fields.title ?? "").slice(0, 160), confidence: op.confidence }] : [];
  });
}

/** Remembers one decision. Never throws: the item is already recorded. */
export async function rememberDecision(
  client: SupabaseClient,
  householdId: string,
  input: { intakeId: string; senderMemberId: string | null; senderKey: string | null; title: string; decision: ValidatedDecision },
  embedder?: Embedder | null,
): Promise<void> {
  try {
    const text = memoryText(input.title, input.decision.whatIs);
    const embedded = await embed(householdId, text, "document", embedder);
    const { error } = await client.from("homesend_decision_memories").upsert(
      {
        household_id: householdId,
        intake_id: input.intakeId,
        sender_member_id: input.senderMemberId,
        sender_key: input.senderKey,
        title: input.title.slice(0, 160) || "Something sent in",
        what_is: input.decision.whatIs.slice(0, 160),
        nearest_kind: input.decision.nearestKind.slice(0, 40),
        new_kind: input.decision.newKind?.slice(0, 60) ?? null,
        source: input.decision.source,
        decision: compactDecision(input.decision),
        ...(embedded ? { embedding: toVectorLiteral(embedded.vector), embedding_model: embedded.model } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,intake_id" },
    );
    if (error && !missingTable(error)) console.warn(`rememberDecision failed: ${error.code ?? "unknown"}`);
  } catch {
    // A memory is a help, never a reason an item fails.
  }
}

/** Which outcome wins when two arrive: an undo or a correction is never overwritten by a later "kept". */
const STRENGTH: Record<DecisionOutcome, number> = { pending: 0, kept: 1, answered: 2, confirmed: 3, corrected: 4, undone: 5 };

export function strongerOutcome(current: DecisionOutcome, next: DecisionOutcome): DecisionOutcome {
  return STRENGTH[next] >= STRENGTH[current] ? next : current;
}

/** What people did with an item's decision. Never throws. */
export async function recordDecisionOutcome(client: SupabaseClient, householdId: string, intakeId: string, outcome: DecisionOutcome, correction?: DecisionCorrection): Promise<void> {
  try {
    const { data, error } = await client.from("homesend_decision_memories").select("id, outcome, corrections").eq("household_id", householdId).eq("intake_id", intakeId).maybeSingle();
    if (error || !data) return;
    const corrections = Array.isArray(data.corrections) ? (data.corrections as DecisionCorrection[]) : [];
    const next = strongerOutcome(data.outcome as DecisionOutcome, outcome);
    await client
      .from("homesend_decision_memories")
      .update({
        outcome: next,
        ...(correction ? { corrections: [...corrections, { field: correction.field.slice(0, 40), to: correction.to.slice(0, 120) }].slice(-10) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("household_id", householdId)
      .eq("id", data.id as string);
  } catch {
    // Learning is best-effort; the person's action already happened.
  }
}
