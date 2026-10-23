import { geminiClient } from "../ai/provider-clients";
import { LIVE_TRANSCRIBE_MAX_BYTES } from "./live-messages";

/**
 * What the person said in a Gemini Live turn, written down properly (the
 * owner's report, 2026-10-18: Gemini heard them clearly and answered well,
 * but the chat showed different, misspelt words).
 *
 * The chat line came from the Live API's `inputTranscription`, a light
 * transcriber that runs beside the conversation model and guesses the
 * language by itself; the conversation model's own understanding is never
 * exposed as text. So the page keeps the turn's audio (the same audio the
 * session already sent to Google) and, once the turn is over, this writes it
 * down verbatim with a full Gemini model, told the person's listening
 * language and the household's own names. The chat line is replaced with it;
 * when this fails or finds no words, Gemini's line stands. It never changes
 * what HomeTalk did: tool calls carry their own words.
 */

/** 16-bit mono PCM, the Live API's input format. */
export const LIVE_TRANSCRIBE_RATE = 16_000;
export { LIVE_TRANSCRIBE_MAX_BYTES } from "./live-messages";

export const LIVE_TRANSCRIBE_MODEL = process.env.WONDERHOME_GEMINI_TRANSCRIBE_MODEL?.trim() || "gemini-flash-latest";

/** A 44-byte RIFF header in front of raw 16-bit mono PCM, so the model reads it as a WAV file. */
export function pcmToWav(pcm: Uint8Array, sampleRate = LIVE_TRANSCRIBE_RATE): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const ascii = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const wav = new Uint8Array(44 + pcm.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

/** The household's own words worth spelling right: first names, at most 60, each kept short. */
export function transcriptionVocabulary(names: readonly string[]): string[] {
  const words = new Set<string>(["WonderHome", "HomeTalk"]);
  for (const name of names) {
    const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!trimmed) continue;
    words.add(trimmed);
    const first = trimmed.split(" ")[0];
    if (first) words.add(first);
    if (words.size >= 60) break;
  }
  return [...words];
}

export function transcriptionInstruction(input: { languageCode: string; vocabulary: readonly string[] }): string {
  return [
    "Write down exactly what the person says in this audio, word for word, as one line.",
    `They usually speak ${input.languageCode}; they may mix in English or another language, so write each word in the language it was said, with English words in English spelling.`,
    input.vocabulary.length > 0 ? `Names and words that may come up, spelt like this: ${input.vocabulary.join(", ")}.` : "",
    "Do not answer, translate, summarise or correct what they say. Do not add quotation marks, labels or notes.",
    "If there is no speech, reply with nothing at all.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The model's line, cleaned: one line, no wrapping quotes, never longer than a turn can be. */
export function cleanTranscript(text: string | null | undefined): string | null {
  const line = (text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  return line ? line.slice(0, 1000) : null;
}

/**
 * A recorded voice note (a WhatsApp or emailed clip, ogg, mp3, m4a or wav),
 * written down by the same model and instruction as a live turn. It is how
 * HomeSend hears a voice note when the household has a Gemini key but no
 * Cloud Speech key.
 */
export async function transcribeAudioFile(
  apiKey: string,
  input: { base64: string; mimeType: string; languageCode: string; vocabulary: readonly string[] },
): Promise<string | null> {
  if (!input.base64) return null;
  const response = await geminiClient(apiKey, "transcribe").models.generateContent({
    model: LIVE_TRANSCRIBE_MODEL,
    contents: [{ role: "user", parts: [{ text: transcriptionInstruction(input) }, { inlineData: { mimeType: input.mimeType, data: input.base64 } }] }],
    config: { temperature: 0, maxOutputTokens: 800 },
  });
  return cleanTranscript(response.text);
}

export async function transcribeLiveTurn(apiKey: string, input: { pcm: Uint8Array; languageCode: string; vocabulary: readonly string[] }): Promise<string | null> {
  if (input.pcm.byteLength < LIVE_TRANSCRIBE_RATE / 5) return null; // under 0.1 s: nothing was said
  const wav = pcmToWav(input.pcm.byteLength > LIVE_TRANSCRIBE_MAX_BYTES ? input.pcm.slice(input.pcm.byteLength - LIVE_TRANSCRIBE_MAX_BYTES) : input.pcm);
  const response = await geminiClient(apiKey, "transcribe").models.generateContent({
    model: LIVE_TRANSCRIBE_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: transcriptionInstruction(input) }, { inlineData: { mimeType: "audio/wav", data: Buffer.from(wav).toString("base64") } }],
      },
    ],
    config: { temperature: 0, maxOutputTokens: 400 },
  });
  return cleanTranscript(response.text);
}
