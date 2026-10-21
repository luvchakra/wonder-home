import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { zodResponseFormat } from "openai/helpers/zod";

import {
  REPORT_ATTACHMENT_MESSAGE,
  REPORT_READING_JSON_SCHEMA,
  REPORT_READING_SYSTEM_PROMPT,
  ReportReadingOutputSchema,
  reportTextMessage,
  type ReportReadingOutput,
} from "./report-reading";
import { log } from "../observability/logger";
import { CLAUDE_MODEL, GEMINI_MODEL, OPENAI_MODEL } from "../ai/model-client";
import type { ModelProvider } from "../ai/model-key";
import { anthropicClient, geminiClient, openaiClient } from "../ai/provider-clients";

/**
 * Asks the household's provider to read one health report (story 21-012).
 * The model only proposes findings; `validateReportReading` decides what
 * survives. Never throws: an outage, a refusal or unreadable output is null.
 */
export type ReportSource =
  | { kind: "text"; text: string }
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }
  | { kind: "pdf"; base64: string };

export type HealthReportModel = (source: ReportSource) => Promise<ReportReadingOutput | null>;

/** The model id each provider reads reports with, kept on the reading. */
export function reportModelId(provider: ModelProvider): string {
  return provider === "anthropic" ? CLAUDE_MODEL : provider === "google" ? GEMINI_MODEL : OPENAI_MODEL;
}

export function createHealthReportModel(provider: ModelProvider, apiKey: string): HealthReportModel {
  const fail = (thrown: unknown) => {
    log.warn("health report reading failed", { provider, reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["provider", "reason"] });
    return null;
  };
  switch (provider) {
    case "anthropic": {
      const client = anthropicClient(apiKey, "vision");
      return async (source) => {
        try {
          const content =
            source.kind === "text"
              ? [{ type: "text" as const, text: reportTextMessage(source.text) }]
              : source.kind === "image"
                ? [{ type: "image" as const, source: { type: "base64" as const, media_type: source.mediaType, data: source.base64 } }, { type: "text" as const, text: REPORT_ATTACHMENT_MESSAGE }]
                : [{ type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: source.base64 } }, { type: "text" as const, text: REPORT_ATTACHMENT_MESSAGE }];
          const response = await client.messages.parse({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: REPORT_READING_SYSTEM_PROMPT,
            messages: [{ role: "user", content }],
            output_config: { format: zodOutputFormat(ReportReadingOutputSchema), effort: "low" },
          });
          if (response.stop_reason === "refusal" || !response.parsed_output) return null;
          return response.parsed_output;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
    case "google": {
      const client = geminiClient(apiKey, "vision");
      return async (source) => {
        try {
          const parts =
            source.kind === "text"
              ? [{ text: reportTextMessage(source.text) }]
              : [{ inlineData: { mimeType: source.kind === "image" ? source.mediaType : "application/pdf", data: source.base64 } }, { text: REPORT_ATTACHMENT_MESSAGE }];
          const response = await client.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts }],
            config: { systemInstruction: REPORT_READING_SYSTEM_PROMPT, responseMimeType: "application/json", responseJsonSchema: REPORT_READING_JSON_SCHEMA, thinkingConfig: { thinkingBudget: 0 } },
          });
          const parsed = response.text ? ReportReadingOutputSchema.safeParse(JSON.parse(response.text)) : null;
          return parsed?.success ? parsed.data : null;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
    case "openai": {
      const client = openaiClient(apiKey, "vision");
      return async (source) => {
        try {
          const content =
            source.kind === "text"
              ? reportTextMessage(source.text)
              : source.kind === "image"
                ? [{ type: "image_url" as const, image_url: { url: `data:${source.mediaType};base64,${source.base64}` } }, { type: "text" as const, text: REPORT_ATTACHMENT_MESSAGE }]
                : [{ type: "file" as const, file: { filename: "report.pdf", file_data: `data:application/pdf;base64,${source.base64}` } }, { type: "text" as const, text: REPORT_ATTACHMENT_MESSAGE }];
          const completion = await client.chat.completions.parse({
            model: OPENAI_MODEL,
            messages: [{ role: "system", content: REPORT_READING_SYSTEM_PROMPT }, { role: "user", content }],
            response_format: zodResponseFormat(ReportReadingOutputSchema, "health_report_reading"),
          });
          return completion.choices[0]?.message.parsed ?? null;
        } catch (thrown) {
          return fail(thrown);
        }
      };
    }
  }
}
