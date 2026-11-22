import type { Transcript } from "../../voice/provider";
import type { KeySource, ModelProvider } from "../../ai/model-key";
import { routeToProvider, type DataUsePolicy } from "../../ai/privacy";

/**
 * Voice notes in HomeSend (Wave 3 §3, §17).
 *
 * A voice note becomes text through the household's speech service, and
 * that text is only ever as trustworthy as the service says it is.
 *
 * Record first (the owner, 2026-11-20: "as autonomous as possible"): an
 * everyday voice note heard below the floor is read on anyway and whatever
 * it adds is recorded as Checking, never confirmed on its own, with Undo
 * (`recordsWhatWasHeard`, `verify.ts` `UNSURE_TRANSCRIPT`). Only one that
 * asks to pay for or buy something keeps the higher floor: below it, it is
 * shown, never acted on, until the household confirms what was heard or
 * types what was really said.
 */

/** Below this a transcript is unsure: an everyday note is still read on and recorded as Checking; a paying or buying one is shown back. */
export const TRANSCRIPT_CONFIDENCE_FLOOR = 0.75;

/** Money or buying — a voice note that asks for either needs a clearer transcript than one that mentions a match on Saturday. */
const CONSEQUENTIAL = /\b(?:pay|paid|payment|transfer|send\s+money|order|buy|purchase|book|cancel|subscribe|renew|inr|rupees?|dollars?)\b|\u20B9|\$\s*\d|\brs\.?\s*\d/i;

/** Where a consequential voice note must sit before it is read on. */
export const CONSEQUENTIAL_CONFIDENCE_FLOOR = 0.9;

/**
 * Gemini writes a voice note down without saying how sure it is. Its line is
 * taken as clear enough for everyday things, never for paying or ordering:
 * those are shown back to be checked, as an unsure transcript always is.
 */
export const GEMINI_TRANSCRIPT_CONFIDENCE = 0.8;

/** Whether a voice note may go to Gemini to be written down: a Google key, and a data-use agreement that lets content reach Google. */
export function geminiMayTranscribe(key: { provider: ModelProvider | null; source: KeySource }, policy: DataUsePolicy): boolean {
  if (key.provider !== "google" || key.source === "none") return false;
  return routeToProvider({ provider: "google", keySource: key.source, policy, hasContent: true }).ok;
}

export type TranscriptGate =
  | { outcome: "confident"; text: string; confidence: number }
  | { outcome: "uncertain"; text: string; confidence: number; consequential: boolean }
  | { outcome: "empty" };

export function isConsequentialInstruction(text: string): boolean {
  return CONSEQUENTIAL.test(text);
}

/**
 * Whether a transcript may go on to be understood (§17): confident enough
 * for what it asks. A payment or order instruction has to clear a higher
 * bar, and nothing below the bar is guessed at.
 */
export function gateTranscript(transcript: Pick<Transcript, "text" | "confidence">): TranscriptGate {
  const text = transcript.text.trim();
  if (!text) return { outcome: "empty" };
  const consequential = isConsequentialInstruction(text);
  const floor = consequential ? CONSEQUENTIAL_CONFIDENCE_FLOOR : TRANSCRIPT_CONFIDENCE_FLOOR;
  if (transcript.confidence >= floor) return { outcome: "confident", text, confidence: transcript.confidence };
  return { outcome: "uncertain", text, confidence: transcript.confidence, consequential };
}

/**
 * Whether an uncertain transcript is still read on, its entry recorded as
 * Checking: every one but a payment or buying instruction, which keeps the
 * higher floor and waits for the household to check what was heard.
 */
export function recordsWhatWasHeard(gate: TranscriptGate): boolean {
  return gate.outcome === "uncertain" && !gate.consequential;
}

/** Whether a transcript was heard less surely than the everyday floor: whatever it adds is Checking. */
export function belowTranscriptFloor(confidence: number | null | undefined): boolean {
  return typeof confidence === "number" && Number.isFinite(confidence) && confidence < TRANSCRIPT_CONFIDENCE_FLOOR;
}

/** The line the review step shows for an uncertain transcript. */
export function uncertainTranscriptPrompt(gate: Extract<TranscriptGate, { outcome: "uncertain" }>): string {
  return gate.consequential
    ? "This sounds like it asks WonderHome to pay for or order something, and I'm not sure I heard it right. Check what I heard, or type what was said."
    : "I'm not sure I heard this right. Check what I heard, or type what was said.";
}
