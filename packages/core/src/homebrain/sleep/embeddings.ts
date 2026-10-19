import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readGeminiVoiceKey, readHouseholdKey } from "../../ai/credentials";
import { platformKey, type ModelProvider } from "../../ai/model-key";
import type { ContentClass } from "../../ai/privacy";
import { geminiClient, openaiClient } from "../../ai/provider-clients";
import { contentClassFor } from "../../context/privacy";
import type { HouseholdContextItem } from "../../context/types";
import { log } from "../../observability/logger";

/**
 * Meaning (HomeBrain Sleep): each record the household keeps, as a vector,
 * so "pasta in pink sauce" is found for "pink pasta" and a question finds a
 * record that shares none of its words.
 *
 * - Only Google and OpenAI offer embeddings. The household's own assistant
 *   key is used when it is one of those; otherwise the household's Gemini
 *   key (set for voice); otherwise WonderHome's platform key when it is one.
 *   With none, nothing is embedded and HomeBrain works by words, as before.
 * - What may leave is the household's own data-use policy: a record whose
 *   class it does not allow is never embedded.
 * - Names never leave: every family member's name becomes "someone" first.
 *   Who a record is about is already on the record; meaning is about what.
 */

export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_MODELS: Record<"google" | "openai", string> = { google: "gemini-embedding-001", openai: "text-embedding-3-small" };

export type Embedder = {
  provider: "google" | "openai";
  model: string;
  /** Null when the provider failed; a caller then carries on without meaning. */
  embed(texts: readonly string[], purpose: "document" | "query"): Promise<number[][] | null>;
};

export function createEmbedder(provider: "google" | "openai", apiKey: string): Embedder {
  const model = EMBEDDING_MODELS[provider];
  const fail = (thrown: unknown) => {
    log.warn("embedding provider failed", { provider, reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["provider", "reason"] });
    return null;
  };
  if (provider === "google") {
    const client = geminiClient(apiKey, "embed");
    return {
      provider,
      model,
      async embed(texts, purpose) {
        if (texts.length === 0) return [];
        try {
          const response = await client.models.embedContent({
            model,
            contents: [...texts],
            config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" },
          });
          const vectors = (response.embeddings ?? []).map((entry) => entry.values ?? []);
          return vectors.length === texts.length && vectors.every((vector) => vector.length === EMBEDDING_DIMENSIONS) ? vectors : null;
        } catch (thrown) {
          return fail(thrown);
        }
      },
    };
  }
  const client = openaiClient(apiKey, "embed");
  return {
    provider,
    model,
    async embed(texts) {
      if (texts.length === 0) return [];
      try {
        const response = await client.embeddings.create({ model, input: [...texts], dimensions: EMBEDDING_DIMENSIONS });
        const vectors = response.data.sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
        return vectors.length === texts.length ? vectors : null;
      } catch (thrown) {
        return fail(thrown);
      }
    },
  };
}

const EMBEDS: ReadonlySet<ModelProvider> = new Set(["google", "openai"]);

/** The key meaning is made with, in the order above; null when the household has none that embeds. */
export async function embedderFor(householdId: string, env: Record<string, string | undefined> = process.env): Promise<Embedder | null> {
  const [assistant, voice] = await Promise.all([readHouseholdKey(householdId).catch(() => null), readGeminiVoiceKey(householdId).catch(() => null)]);
  const platform = platformKey(env);
  for (const key of [assistant, voice, platform]) {
    if (key && key.key.trim() && EMBEDS.has(key.provider)) return createEmbedder(key.provider as "google" | "openai", key.key);
  }
  return null;
}

/** Every name a family member goes by, longest first, so "Asmi Mehta" goes before "Asmi". */
export function namesIn(items: readonly HouseholdContextItem[]): string[] {
  const names = new Set<string>();
  for (const item of items) {
    if (item.entityType !== "member") continue;
    for (const value of [item.attributes.displayName, item.attributes.nickname]) {
      if (typeof value !== "string" || value.trim().length < 2) continue;
      names.add(value.trim());
      for (const part of value.trim().split(/\s+/)) if (part.length >= 3) names.add(part);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

export function withoutNames(text: string, names: readonly string[]): string {
  let out = text;
  for (const name of names) out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s)?\\b`, "gi"), "someone");
  return out.replace(/\s+/g, " ").trim();
}

/** What is embedded for a record: its summary without names, the words it is also known by. */
export function embeddingText(item: HouseholdContextItem, names: readonly string[]): string {
  return withoutNames([item.summary, ...item.aliases.filter((alias) => typeof alias === "string" && alias.length > 0)].join(" · "), names).slice(0, 1000);
}

/** Records worth meaning: what the household keeps, in a class it lets leave; never health (read live) or credentials. */
export function embeddable(item: HouseholdContextItem, allowed: readonly ContentClass[]): boolean {
  if (item.domain === "health" || item.domain === "people" || item.domain === "notifications" || item.domain === "hometalk" || item.domain === "attention") return false;
  if (item.freshness === "superseded") return false;
  return allowed.includes(contentClassFor(item.privacyClass));
}

export function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 24);
}

export const toVectorLiteral = (vector: readonly number[]) => `[${vector.map((value) => Number(value.toFixed(6))).join(",")}]`;

export function fromVectorLiteral(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
}

/**
 * Brings the household's vectors in line with its records: new or changed
 * records are embedded (at most `max` a call), and vectors for records that
 * are gone or no longer allowed are removed. Never throws.
 */
export async function refreshEmbeddings(
  admin: SupabaseClient,
  input: { householdId: string; items: readonly HouseholdContextItem[]; embedder: Embedder; allowed: readonly ContentClass[]; max?: number },
): Promise<{ embedded: number; removed: number; available: boolean }> {
  const names = namesIn(input.items);
  const wanted = new Map<string, { text: string; hash: string; privacyClass: string }>();
  for (const item of input.items) {
    if (!embeddable(item, input.allowed)) continue;
    const text = embeddingText(item, names);
    if (text) wanted.set(item.id, { text, hash: hashOf(text), privacyClass: item.privacyClass });
  }
  const { data, error } = await admin.from("homebrain_embeddings").select("item_id, content_hash").eq("household_id", input.householdId).eq("model", input.embedder.model).limit(5000);
  if (error) return { embedded: 0, removed: 0, available: false };
  const existing = new Map(((data ?? []) as { item_id: string; content_hash: string }[]).map((row) => [row.item_id, row.content_hash]));

  const stale = [...existing.keys()].filter((id) => !wanted.has(id));
  for (let index = 0; index < stale.length; index += 100) {
    await admin.from("homebrain_embeddings").delete().eq("household_id", input.householdId).eq("model", input.embedder.model).in("item_id", stale.slice(index, index + 100));
  }

  const changed = [...wanted.entries()].filter(([id, entry]) => existing.get(id) !== entry.hash).slice(0, input.max ?? 200);
  let embedded = 0;
  for (let index = 0; index < changed.length; index += 50) {
    const batch = changed.slice(index, index + 50);
    const vectors = await input.embedder.embed(batch.map(([, entry]) => entry.text), "document");
    if (!vectors) break;
    const rows = batch.map(([id, entry], position) => ({
      household_id: input.householdId,
      item_id: id,
      model: input.embedder.model,
      content_hash: entry.hash,
      privacy_class: entry.privacyClass,
      embedding: toVectorLiteral(vectors[position]!),
      updated_at: new Date().toISOString(),
    }));
    const { error: writeError } = await admin.from("homebrain_embeddings").upsert(rows, { onConflict: "household_id,model,item_id" });
    if (writeError) break;
    embedded += rows.length;
  }
  return { embedded, removed: stale.length, available: true };
}

/** The household's vectors for these records, for comparing two of them. */
export async function readVectors(admin: SupabaseClient, householdId: string, model: string, itemIds: readonly string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (let index = 0; index < itemIds.length; index += 200) {
    const { data, error } = await admin.from("homebrain_embeddings").select("item_id, embedding").eq("household_id", householdId).eq("model", model).in("item_id", itemIds.slice(index, index + 200));
    if (error) break;
    for (const row of (data ?? []) as { item_id: string; embedding: unknown }[]) {
      const vector = fromVectorLiteral(row.embedding);
      if (vector) out.set(row.item_id, vector);
    }
  }
  return out;
}

/** The records closest in meaning to a question, by item id → similarity. Empty on any failure: a turn never waits on meaning. */
export async function semanticMatches(
  admin: SupabaseClient,
  input: { householdId: string; embedder: Embedder; question: string; names: readonly string[]; limit?: number },
): Promise<Map<string, number>> {
  const text = withoutNames(input.question, input.names);
  if (text.length < 3) return new Map();
  const vectors = await input.embedder.embed([text], "query");
  if (!vectors?.[0]) return new Map();
  const { data, error } = await admin.rpc("match_homebrain_embeddings", {
    p_household_id: input.householdId,
    p_model: input.embedder.model,
    p_query: toVectorLiteral(vectors[0]),
    p_limit: input.limit ?? 12,
  });
  if (error) return new Map();
  return new Map(((data ?? []) as { item_id: string; similarity: number }[]).map((row) => [row.item_id, Number(row.similarity)]));
}
