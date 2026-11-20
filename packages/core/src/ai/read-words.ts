import { SECOND_READ_MODEL } from "./model-client";
import type { ModelProvider } from "./model-key";
import { anthropicClient, geminiClient, openaiClient } from "./provider-clients";
import type { IntakeSource } from "./classify-intake";
import { UNTRUSTED_CONTENT_RULE } from "../homesend/injection";

/**
 * The words on a photo or PDF, written down before anything is read from
 * them (the owner's 2026-11-20 review: "OCR first for photos and PDFs"). Used
 * only on a second read, before HomeSend sets anything aside as unreadable;
 * the text then goes through the same reading and checks as anything typed.
 * Through `provider-clients.ts` only. Null when there are no words, or the
 * provider can't be reached.
 */

const MAX_WORDS_CHARS = 12_000;

const TRANSCRIBE_SYSTEM = `You write down the words in a picture or document, exactly as printed or handwritten, in reading order. Plain text only, one line per printed line. No commentary, no summary, no translation. If there are no readable words, answer with nothing. ${UNTRUSTED_CONTENT_RULE}`;

export async function readWordsOff(provider: ModelProvider, apiKey: string, source: Exclude<IntakeSource, { text: string }>): Promise<string | null> {
  try {
    let text: string | null | undefined = null;
    switch (provider) {
      case "anthropic": {
        const client = anthropicClient(apiKey, "vision");
        const block =
          "image" in source
            ? { type: "image" as const, source: { type: "base64" as const, media_type: source.image.mediaType, data: source.image.base64 } }
            : { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: source.document.base64 } };
        const response = await client.messages.create({
          model: SECOND_READ_MODEL.anthropic,
          max_tokens: 4096,
          system: TRANSCRIBE_SYSTEM,
          messages: [{ role: "user", content: [block, { type: "text", text: "Write down the words." }] }],
        });
        if (response.stop_reason === "refusal") return null;
        text = response.content.map((part) => (part.type === "text" ? part.text : "")).join("");
        break;
      }
      case "google": {
        const client = geminiClient(apiKey, "vision");
        const data = "image" in source ? { mimeType: source.image.mediaType, data: source.image.base64 } : { mimeType: "application/pdf", data: source.document.base64 };
        const response = await client.models.generateContent({
          model: SECOND_READ_MODEL.google,
          contents: [{ role: "user", parts: [{ inlineData: data }, { text: "Write down the words." }] }],
          config: { systemInstruction: TRANSCRIBE_SYSTEM },
        });
        text = response.text;
        break;
      }
      case "openai": {
        const client = openaiClient(apiKey, "vision");
        const completion = await client.chat.completions.create({
          model: SECOND_READ_MODEL.openai,
          messages: [
            { role: "system", content: TRANSCRIBE_SYSTEM },
            {
              role: "user",
              content:
                "image" in source
                  ? [{ type: "image_url", image_url: { url: `data:${source.image.mediaType};base64,${source.image.base64}` } }, { type: "text", text: "Write down the words." }]
                  : [{ type: "file", file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${source.document.base64}` } }, { type: "text", text: "Write down the words." }],
            },
          ],
        });
        text = completion.choices[0]?.message.content;
        break;
      }
    }
    const words = (text ?? "").trim().slice(0, MAX_WORDS_CHARS);
    return words.length >= 8 ? words : null;
  } catch {
    return null;
  }
}
