import { classifyIntake } from "../ai/classify-intake";
import { CLAUDE_MODEL, createAnswerComposer, createClaudeUnderstanding, createGeminiUnderstanding, createOpenAIUnderstanding, GEMINI_MODEL, OPENAI_MODEL } from "../ai/model-client";
import type { ModelKey } from "../ai/model-key";
import { GOLDEN_CASES } from "./cases";
import { runCase, type Models } from "./runners";
import type { EvalCase, EvaluationRun } from "./types";
import { contextVersion, datasetVersion, promptVersion } from "./versions";

/**
 * One evaluation run (Wave 5 §11, §12): the whole golden set, through one
 * configuration. With no key the run is deterministic — the rules,
 * grounding, reconciliation and composer every surface falls back to. With
 * a key it is that provider's run: the same cases, the same comparison, so
 * every configured provider is measured against the same thing.
 */

export type RunTarget = { provider: "deterministic" } | { provider: Exclude<ModelKey["provider"], null>; key: string };

export function modelsFor(target: RunTarget): { models: Models; model: string } {
  if (target.provider === "deterministic") return { models: {}, model: "rules" };
  const understand =
    target.provider === "anthropic"
      ? createClaudeUnderstanding(target.key)
      : target.provider === "google"
        ? createGeminiUnderstanding(target.key)
        : createOpenAIUnderstanding(target.key);
  const model = target.provider === "anthropic" ? CLAUDE_MODEL : target.provider === "google" ? GEMINI_MODEL : OPENAI_MODEL;
  return {
    model,
    models: {
      understand,
      classify: (source, reference) =>
        classifyIntake(
          target.provider,
          target.key,
          { text: source.text },
          { channel: source.channel, subject: source.subject ?? null, filename: source.attachment ?? null, now: reference.now, timezone: reference.timezone },
        ),
      compose: createAnswerComposer(target.provider, target.key),
    },
  };
}

export async function runEvaluation(target: RunTarget, cases: readonly EvalCase[] = GOLDEN_CASES, now: Date = new Date()): Promise<EvaluationRun> {
  const { models, model } = modelsFor(target);
  const results = [];
  // One case at a time: a live provider is not hammered, and latency means
  // the case's own latency.
  for (const c of cases) results.push(await runCase(c, models));
  return {
    provider: target.provider,
    model,
    promptVersion: promptVersion(),
    contextVersion: contextVersion(),
    datasetVersion: datasetVersion(cases),
    startedAt: now.toISOString(),
    results,
  };
}
