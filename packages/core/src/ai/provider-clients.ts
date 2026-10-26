import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { classifyKeyFailure, failureOf, noteKeyFailure, noteKeyWorking } from "./key-alerts";

/**
 * Every model client WonderHome makes, with a time limit (Wave 5 §15, §16).
 *
 * The SDK defaults are ten minutes and two retries, so a stalled provider
 * would hold a HomeTalk turn or an email webhook for minutes. Each call now
 * has a budget that fits the moment it serves:
 *
 * - understanding a HomeTalk turn: a person is waiting on the reply;
 * - composing an answer: slightly longer, since it is the reply itself;
 * - reading a HomeSend document or image: larger inputs, but still bounded.
 *
 * On a timeout the SDK throws. Every caller already turns a thrown provider
 * error into its deterministic path: the rules for understanding, the
 * grounded composer for an answer, and "kept, waiting for a person" for
 * intake. So a slow provider costs the household the model, never the
 * turn. One retry covers a dropped connection without doubling the wait.
 */
export const MODEL_TIMEOUT_MS = {
  understand: 12_000,
  compose: 15_000,
  classify: 30_000,
  vision: 30_000,
  /** Putting one checked reply into the person's language (story 22-005): short, and the English is always there to fall back on. */
  translate: 8_000,
  /** Minting a short-lived Live API token (Gemini Voice): one small request. */
  live_token: 10_000,
  /** Writing down one Gemini Live turn word for word (the chat line): a minute of audio at most. */
  transcribe: 15_000,
  /** Ideas for a meal from what is at home (story 25-018): a person tapped and is waiting, with three short dishes to write. */
  suggest: 25_000,
  /** Turning text into meaning (HomeBrain Sleep): a question on a turn, a night's batch of records. Small and fast; a turn never waits past this. */
  embed: 8_000,
  /** A batch of the Home cat's passing thoughts: nobody waits on it, the page shows a built-in line meanwhile. */
  muse: 10_000,
  /** A night's sleep (HomeBrain Sleep): nobody is waiting, but a night has many households. */
  sleep: 45_000,
} as const;

export type ModelCallKind = keyof typeof MODEL_TIMEOUT_MS;

const MAX_RETRIES = 1;

export function anthropicClient(apiKey: string, kind: ModelCallKind): Anthropic {
  return new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS[kind], maxRetries: MAX_RETRIES, fetch: watchedFetch(apiKey, "anthropic") });
}

export function geminiClient(apiKey: string, kind: ModelCallKind): GoogleGenAI {
  return watchGemini(new GoogleGenAI({ apiKey, httpOptions: { timeout: MODEL_TIMEOUT_MS[kind] } }), apiKey);
}

export function openaiClient(apiKey: string, kind: ModelCallKind): OpenAI {
  return new OpenAI({ apiKey, timeout: MODEL_TIMEOUT_MS[kind], maxRetries: MAX_RETRIES, fetch: watchedFetch(apiKey, "openai") });
}

/**
 * Every call's answer is shown to `key-alerts.ts`: a refusal that is about the
 * key (out of credits, out of quota, not valid) is recorded so an Admin hears
 * of it; a call that works clears it. The answer itself is passed on untouched.
 */
function watchedFetch(apiKey: string, provider: "anthropic" | "openai"): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (response.ok) void noteKeyWorking(apiKey);
    else if (response.status === 400 || response.status === 401 || response.status === 402 || response.status === 403 || response.status === 429) {
      const text = await response.clone().text().catch(() => "");
      const alert = classifyKeyFailure(provider, response.status, text);
      if (alert) void noteKeyFailure(apiKey, provider, alert);
    }
    return response;
  };
}

/** The Google SDK takes no fetch of its own, so its two calls WonderHome makes are watched where they are made. */
function watchGemini(client: GoogleGenAI, apiKey: string): GoogleGenAI {
  const watch = <A extends unknown[], R>(call: (...args: A) => Promise<R>, clears: boolean) =>
    async (...args: A): Promise<R> => {
      try {
        const result = await call(...args);
        if (clears) void noteKeyWorking(apiKey);
        return result;
      } catch (thrown) {
        const { status, text } = failureOf(thrown);
        const alert = classifyKeyFailure("google", status, text);
        if (alert) void noteKeyFailure(apiKey, "google", alert);
        throw thrown;
      }
    };
  client.models.generateContent = watch(client.models.generateContent.bind(client.models), true);
  // A voice token is minted even for a key with no credits left (2026-10-26), so minting one proves nothing.
  client.authTokens.create = watch(client.authTokens.create.bind(client.authTokens), false);
  return client;
}
