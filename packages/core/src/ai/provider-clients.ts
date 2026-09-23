import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

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
} as const;

export type ModelCallKind = keyof typeof MODEL_TIMEOUT_MS;

const MAX_RETRIES = 1;

export function anthropicClient(apiKey: string, kind: ModelCallKind): Anthropic {
  return new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS[kind], maxRetries: MAX_RETRIES });
}

export function geminiClient(apiKey: string, kind: ModelCallKind): GoogleGenAI {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: MODEL_TIMEOUT_MS[kind] } });
}

export function openaiClient(apiKey: string, kind: ModelCallKind): OpenAI {
  return new OpenAI({ apiKey, timeout: MODEL_TIMEOUT_MS[kind], maxRetries: MAX_RETRIES });
}
