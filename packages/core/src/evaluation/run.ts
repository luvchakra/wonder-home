import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntake, type IntakeSource } from "../ai/classify-intake";
import { CLAUDE_ANSWER_MODEL, CLAUDE_INTAKE_MODEL, CLAUDE_UNDERSTANDING_MODEL, createAnswerComposer, createClaudeUnderstanding, createGeminiUnderstanding, createOpenAIUnderstanding, GEMINI_MODEL, OPENAI_MODEL } from "../ai/model-client";
import type { ModelKey } from "../ai/model-key";
import { createTidyJudge } from "../homesend/tidy-model";
import { createTriviaTopicJudge } from "../school/trivia-safety";
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
  // Anthropic turns run on tiered models (understanding, answers) and HomeSend on the main one: the record names all three.
  const model =
    target.provider === "anthropic"
      ? `understand ${CLAUDE_UNDERSTANDING_MODEL}, answer ${CLAUDE_ANSWER_MODEL}, documents ${CLAUDE_INTAKE_MODEL}`
      : target.provider === "google"
        ? GEMINI_MODEL
        : OPENAI_MODEL;
  return {
    model,
    models: {
      understand,
      classify: (source, reference) =>
        classifyIntake(
          target.provider,
          target.key,
          liveSource(source),
          { channel: source.channel, subject: source.subject ?? null, filename: source.attachment ?? null, now: reference.now, timezone: reference.timezone },
        ),
      compose: createAnswerComposer(target.provider, target.key),
      tidy: createTidyJudge(target.provider, target.key),
      triviaCheck: createTriviaTopicJudge(target.provider, target.key),
    },
  };
}

/**
 * What a live provider reads (2026-11-22 live check): a case whose attachment is a real fixture
 * image (the HD exam timetable) is sent as that image, as HomeSend sends a photo; every other
 * case as its text. Before this the photo cases were read from a one-line description only.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "homesend-documents");
function liveSource(source: { text: string; attachment?: string }): IntakeSource {
  const file = source.attachment && /\.(jpe?g|png)$/i.test(source.attachment) ? join(FIXTURES, source.attachment) : null;
  if (!file || !existsSync(file)) return { text: source.text };
  return { image: { mediaType: /\.png$/i.test(file) ? "image/png" : "image/jpeg", base64: readFileSync(file).toString("base64") } };
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
