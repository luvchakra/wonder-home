import { createHash } from "node:crypto";
import { z } from "zod";

import { INTAKE_SYSTEM_PROMPT } from "../ai/classify-intake";
import { ANSWER_SYSTEM_PROMPT, INTENT_OUTPUT_SCHEMA, languageLine, systemFor, translationSystemFor } from "../ai/model-client";

/**
 * The prompt version (Wave 5 §12): a hash of every prompt a model is given
 * and the output schema it must answer in. Kept apart from the rest of
 * `versions.ts` so production code (correction evidence) can stamp it
 * without loading the golden households. Computed once per process.
 */

let memo: string | null = null;

export function promptVersion(): string {
  memo ??= `p-${createHash("sha256")
    .update(JSON.stringify([systemFor(undefined), languageLine("{language}"), ANSWER_SYSTEM_PROMPT, translationSystemFor("{language}"), INTAKE_SYSTEM_PROMPT, z.toJSONSchema(INTENT_OUTPUT_SCHEMA)]))
    .digest("hex")
    .slice(0, 12)}`;
  return memo;
}
