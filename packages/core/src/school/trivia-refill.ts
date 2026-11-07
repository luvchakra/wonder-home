import type { SupabaseClient } from "@supabase/supabase-js";

import { readHouseholdKey } from "../ai/credentials";
import { platformKey, resolveModelKey } from "../ai/model-key";
import { routeToProvider } from "../ai/privacy";
import { loadDataUse } from "../ai/privacy-repository";
import { isLanguage, type LanguageCode } from "../i18n/locales";
import { log } from "../observability/logger";
import { hitRateLimit } from "../security/rate-limit";
import { normaliseTopic, TRIVIA_BANDS, type TriviaBand } from "./trivia";
import { createTriviaWriter, generateCards, type TriviaWriter } from "./trivia-generate";
import { POOL_TARGET } from "./trivia-repository";
import { createTriviaTopicJudge, decideTopic, type TriviaTopicJudge } from "./trivia-safety";

/**
 * Kids Trivia's background refill (story 08-035), a step of the background
 * clock (`jobs/runner.ts` "clock.trivia-refill", on GitHub Actions; the
 * delivery clock on Vercel takes it over only while GitHub is stale). Never on
 * a child's request.
 *
 * For each low pool in the queue, oldest first, a few a run:
 *  - a pool already at its target is done;
 *  - the household that asked pays with its own model terms (its key or the
 *    platform's, its data-use policy, the shared hourly model budget) and at
 *    most `DAILY_BATCHES` batches a day; over that, the pool waits;
 *  - the topic is checked by the model again first (a topic kept on the rules
 *    alone, while no model was reachable, gets its model check here); a topic
 *    turned away is dropped from the queue and nothing is written;
 *  - a batch is written, every card validated and fact-checked
 *    (`trivia-generate.ts`), and only the survivors are stored.
 * Nothing about the child or household is sent: the topic word, the age band
 * and the language.
 */

export const DAILY_BATCHES = 6;
const MAX_ATTEMPTS = 5;
const RETRY_HOURS = 6;

export type RefillModels = { writer: TriviaWriter; judge: TriviaTopicJudge };

export type RefillResult = { looked: number; written: number; cards: number; dropped: number; waiting: number };

type QueueRow = { topic_key: string; age_band: string; language: string; label: string; household_id: string; attempts: number };

/** The household's model for a refill, on its own terms; null when none may be used. */
export async function refillModelsFor(admin: SupabaseClient, householdId: string): Promise<RefillModels | null> {
  try {
    const [policy, householdKey] = await Promise.all([loadDataUse(admin, householdId), readHouseholdKey(householdId).catch(() => null)]);
    const key = resolveModelKey(householdKey, platformKey());
    const route = routeToProvider({ provider: key.provider, keySource: key.source, policy, hasContent: true });
    if (!route.ok || !key.provider || !key.key) return null;
    if (!(await hitRateLimit(admin, "ai.model", householdId))) return null;
    return { writer: createTriviaWriter(key.provider, key.key), judge: createTriviaTopicJudge(key.provider, key.key) };
  } catch {
    return null;
  }
}

export async function runTriviaRefill(
  admin: SupabaseClient,
  options: { now?: Date; limit?: number; modelsFor?: (householdId: string) => Promise<RefillModels | null> } = {},
): Promise<RefillResult> {
  const now = options.now ?? new Date();
  const modelsFor = options.modelsFor ?? ((householdId: string) => refillModelsFor(admin, householdId));
  const result: RefillResult = { looked: 0, written: 0, cards: 0, dropped: 0, waiting: 0 };
  const { data, error } = await admin
    .from("trivia_refill_queue")
    .select("topic_key, age_band, language, label, household_id, attempts")
    .lte("next_try_at", now.toISOString())
    .order("requested_at")
    .limit(options.limit ?? 4);
  // A database before the migration: nothing to do.
  if (error) return result;
  const day = now.toISOString().slice(0, 10);
  for (const row of (data ?? []) as QueueRow[]) {
    result.looked += 1;
    const match = { topic_key: row.topic_key, age_band: row.age_band, language: row.language };
    const drop = async () => {
      await admin.from("trivia_refill_queue").delete().match(match);
      result.dropped += 1;
    };
    const later = async (hours: number, attempt: boolean) => {
      const attempts = row.attempts + (attempt ? 1 : 0);
      if (attempts >= MAX_ATTEMPTS) return drop();
      await admin
        .from("trivia_refill_queue")
        .update({ next_try_at: new Date(now.getTime() + hours * 3_600_000).toISOString(), attempts })
        .match(match);
      result.waiting += 1;
    };
    try {
      const band = (TRIVIA_BANDS as readonly string[]).includes(row.age_band) ? (row.age_band as TriviaBand) : null;
      const language: LanguageCode | null = isLanguage(row.language) ? row.language : null;
      const topic = normaliseTopic(row.label);
      if (!band || !language || !topic) {
        await drop();
        continue;
      }
      const { count } = await admin.from("trivia_pool").select("id", { count: "exact", head: true }).match(match);
      if ((count ?? 0) >= POOL_TARGET) {
        await drop();
        continue;
      }
      const { data: usage } = await admin.from("trivia_generation_usage").select("batches").eq("household_id", row.household_id).eq("day", day).maybeSingle();
      const used = (usage as { batches: number } | null)?.batches ?? 0;
      if (used >= DAILY_BATCHES) {
        await later(RETRY_HOURS, false);
        continue;
      }
      const models = await modelsFor(row.household_id);
      if (!models) {
        await later(RETRY_HOURS * 2, true);
        continue;
      }
      // The model's own check of the topic, before anything is written about it.
      const decision = await decideTopic(topic, band, models.judge);
      if (!decision.ok || decision.checkedBy !== "model") {
        if (!decision.ok) await drop();
        else await later(RETRY_HOURS, true);
        continue;
      }
      const batch = await generateCards(models.writer, { topic: topic.label, band, language });
      await admin.from("trivia_generation_usage").upsert({ household_id: row.household_id, day, batches: used + 1 }, { onConflict: "household_id,day" });
      result.written += 1;
      if (batch.kept.length > 0) {
        const { error: insertError } = await admin.from("trivia_pool").upsert(
          batch.kept.map((card) => ({
            topic_key: row.topic_key,
            age_band: band,
            language,
            kind: card.kind,
            text: card.text,
            options: card.options,
            answer: card.answer,
            explain: card.explain,
            source_hint: card.sourceHint,
            difficulty: card.difficulty,
          })),
          { onConflict: "topic_key,age_band,language,text", ignoreDuplicates: true },
        );
        if (insertError) throw new Error(insertError.code ?? "insert");
        result.cards += batch.kept.length;
      }
      log.info("trivia refill batch", { kept: batch.kept.length, rejected: batch.rejected.length, checked: batch.checked, allow: ["kept", "rejected", "checked"] });
      // Kept some: the pool is checked again on the next low reading. Kept none: try later, a few times.
      if (batch.kept.length > 0) await drop();
      else await later(RETRY_HOURS, true);
    } catch (thrown) {
      log.warn("trivia refill failed", { reason: thrown instanceof Error ? thrown.message : "unknown", allow: ["reason"] });
      await later(RETRY_HOURS, true).catch(() => undefined);
    }
  }
  return result;
}
