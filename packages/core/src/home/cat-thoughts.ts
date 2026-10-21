import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

import { CLAUDE_ANSWER_MODEL, GEMINI_MODEL, OPENAI_MODEL } from "../ai/model-client";
import type { ModelProvider } from "../ai/model-key";
import { anthropicClient, geminiClient, openaiClient } from "../ai/provider-clients";
import { languageInfo, type LanguageCode } from "../i18n/locales";
import { log } from "../observability/logger";

/**
 * What the cat on Home is thinking (the owner, 2026-10-21: "use ai to create
 * something new on every page load").
 *
 * A thought is whimsy, never information: a sunbeam, a nap, a sock under the
 * sofa. So nothing of any household is sent — the model is told only the
 * language — and it is written with the platform's own key. One call writes a
 * batch per language, kept per server for a few hours (platform data, the same
 * for every household, like `screen-picks.ts`); each load takes a different
 * one. Every line is checked before it is kept: one short sentence, no
 * numbers, links or quotes, nothing that reads like advice or a fact about
 * someone. Without a key, or when the model fails, the cat thinks one of its
 * built-in lines instead (`today.thought.*`), so the bubble is never empty.
 */

export const THOUGHT_MAX = 90;
const BATCH = 16;
const POOL_MS = 3 * 60 * 60 * 1000;

const ThoughtsSchema = z.object({ thoughts: z.array(z.string()).max(24) });

export function thoughtsSystemPrompt(language: string): string {
  return [
    "You write the passing thoughts of a contented house cat for a family app's home screen.",
    `Write ${BATCH} different thoughts in ${language}.`,
    "Each is one short, warm, gently funny sentence of at most 12 words, in the cat's own voice: sunbeams, naps, windows, boxes, yarn, birds, a warm lap, the smell of dinner.",
    "Never give advice, news, facts, numbers, dates, names, places, brands, links, emoji or quotation marks. Never mention health, money, food safety or danger.",
    'Reply as JSON: {"thoughts": ["...", "..."]}.',
  ].join(" ");
}

/** Keeps a line only when it is one short, plain sentence with nothing a person could mistake for information. */
export function acceptableThought(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const line = value.replace(/\s+/g, " ").trim();
  if (line.length < 4 || line.length > THOUGHT_MAX) return null;
  if (/[0-9०-९٠-٩]|https?:|www\.|@|#|["“”«»「」]/.test(line)) return null;
  if (/\p{Extended_Pictographic}/u.test(line)) return null;
  // One sentence: no stop followed by more words, with or without a space after it.
  const body = line.replace(/[.!?。！？।]+$/, "");
  if (/[.!?]\s+\S/.test(body) || /[。！？।]\S/.test(body)) return null;
  return line;
}

export type ThoughtModel = (language: string) => Promise<string[] | null>;

export function createThoughtModel(provider: ModelProvider, apiKey: string): ThoughtModel {
  const fail = (thrown: unknown) => {
    log.warn("cat thoughts provider failed", { provider, reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["provider", "reason"] });
    return null;
  };
  const user = "Write the thoughts now.";
  switch (provider) {
    case "anthropic": {
      const client = anthropicClient(apiKey, "muse");
      return async (language) => {
        try {
          const response = await client.messages.parse({
            model: CLAUDE_ANSWER_MODEL,
            max_tokens: 1024,
            system: thoughtsSystemPrompt(language),
            messages: [{ role: "user", content: user }],
            output_config: { format: zodOutputFormat(ThoughtsSchema), effort: "low" },
          });
          return response.stop_reason === "refusal" || !response.parsed_output ? null : response.parsed_output.thoughts;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
    case "google": {
      const client = geminiClient(apiKey, "muse");
      return async (language) => {
        try {
          const response = await client.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: user }] }],
            config: { systemInstruction: thoughtsSystemPrompt(language), responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
          });
          const parsed = response.text ? ThoughtsSchema.safeParse(JSON.parse(response.text)) : null;
          return parsed?.success ? parsed.data.thoughts : null;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
    case "openai": {
      const client = openaiClient(apiKey, "muse");
      return async (language) => {
        try {
          const completion = await client.chat.completions.parse({
            model: OPENAI_MODEL,
            messages: [{ role: "system", content: thoughtsSystemPrompt(language) }, { role: "user", content: user }],
            response_format: zodResponseFormat(ThoughtsSchema, "thoughts"),
          });
          return completion.choices[0]?.message.parsed?.thoughts ?? null;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
  }
}

const pools = new Map<string, { at: number; thoughts: string[] }>();
const filling = new Map<string, Promise<void>>();
/** A batch that came back empty waits this long before the next try, so an outage is not asked on every load. */
const RETRY_MS = 15 * 60 * 1000;
const lastTry = new Map<string, number>();

/**
 * This server's thoughts for a language: the kept batch while it is fresh, a
 * new batch otherwise. A page never waits on a model: a stale or missing pool
 * is refilled in the background and this answers with what is there now.
 */
export function catThoughts(language: LanguageCode, model: ThoughtModel | null, now = Date.now()): string[] {
  const kept = pools.get(language);
  if (model && (!kept || now - kept.at > POOL_MS) && !filling.has(language) && now - (lastTry.get(language) ?? -Infinity) > RETRY_MS) {
    lastTry.set(language, now);
    const fill = model(languageInfo(language).englishName)
      .then((lines) => {
        const thoughts = [...new Set((lines ?? []).map(acceptableThought).filter((line): line is string => line !== null))];
        if (thoughts.length >= 3) pools.set(language, { at: Date.now(), thoughts });
      })
      .catch(() => undefined)
      .finally(() => filling.delete(language));
    filling.set(language, fill);
  }
  return kept?.thoughts ?? [];
}

/** Waits for a refill already under way, at most `ms` (the page's own short budget). */
export async function settleThoughts(language: LanguageCode, ms: number): Promise<void> {
  const fill = filling.get(language);
  if (!fill) return;
  await Promise.race([fill, new Promise((resolve) => setTimeout(resolve, ms))]);
}

/** This load's thought: one of the model's, or the number of a built-in line (1…`builtIn`) when there are none. */
export function pickThought(thoughts: readonly string[], builtIn: number, random: () => number = Math.random): { line: string } | { builtIn: number } {
  return thoughts.length > 0 ? { line: thoughts[Math.floor(random() * thoughts.length)]! } : { builtIn: 1 + Math.floor(random() * builtIn) };
}

/** For tests: forget what this server has kept. */
export function resetThoughtPools(): void {
  pools.clear();
  filling.clear();
  lastTry.clear();
}
