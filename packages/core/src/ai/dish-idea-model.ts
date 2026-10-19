import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { zodResponseFormat } from "openai/helpers/zod";

import { DISH_IDEA_JSON_SCHEMA, DISH_IDEA_SYSTEM_PROMPT, DishIdeaOutputSchema, dishIdeaMessage, type DishIdeaInput, type DishIdeaOutput } from "../meals/dish-ideas";
import { log } from "../observability/logger";
import { CLAUDE_ANSWER_MODEL, GEMINI_MODEL, OPENAI_MODEL } from "./model-client";
import type { ModelProvider } from "./model-key";
import { anthropicClient, geminiClient, openaiClient } from "./provider-clients";

/** Asks the household's provider for dish ideas (25-018). Never throws: an outage, a refusal or unreadable output is null. */
export type DishIdeaModel = (input: DishIdeaInput) => Promise<DishIdeaOutput | null>;

export function createDishIdeaModel(provider: ModelProvider, apiKey: string): DishIdeaModel {
  const fail = (thrown: unknown) => {
    log.warn("dish ideas provider failed", { provider, reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["provider", "reason"] });
    return null;
  };
  switch (provider) {
    case "anthropic": {
      const client = anthropicClient(apiKey, "suggest");
      return async (input) => {
        try {
          const response = await client.messages.parse({
            model: CLAUDE_ANSWER_MODEL,
            max_tokens: 2048,
            system: DISH_IDEA_SYSTEM_PROMPT,
            messages: [{ role: "user", content: dishIdeaMessage(input) }],
            output_config: { format: zodOutputFormat(DishIdeaOutputSchema), effort: "low" },
          });
          if (response.stop_reason === "refusal" || !response.parsed_output) return null;
          return response.parsed_output;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
    case "google": {
      const client = geminiClient(apiKey, "suggest");
      return async (input) => {
        try {
          const response = await client.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: dishIdeaMessage(input) }] }],
            config: { systemInstruction: DISH_IDEA_SYSTEM_PROMPT, responseMimeType: "application/json", responseJsonSchema: DISH_IDEA_JSON_SCHEMA, thinkingConfig: { thinkingBudget: 0 } },
          });
          const parsed = response.text ? DishIdeaOutputSchema.safeParse(JSON.parse(response.text)) : null;
          return parsed?.success ? parsed.data : null;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
    case "openai": {
      const client = openaiClient(apiKey, "suggest");
      return async (input) => {
        try {
          const completion = await client.chat.completions.parse({
            model: OPENAI_MODEL,
            messages: [{ role: "system", content: DISH_IDEA_SYSTEM_PROMPT }, { role: "user", content: dishIdeaMessage(input) }],
            response_format: zodResponseFormat(DishIdeaOutputSchema, "dish_ideas"),
          });
          return completion.choices[0]?.message.parsed ?? null;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
  }
}
