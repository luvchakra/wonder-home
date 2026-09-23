import type { Transcript } from "../voice/provider";

/**
 * Voice notes in HomeSend (Wave 3 §3, §17).
 *
 * A voice note becomes text through the household's speech service, and
 * that text is only ever as trustworthy as the service says it is. The
 * rule is simple: an uncertain transcript is shown, never acted on. The
 * household sees what WonderHome heard and either confirms it or types what
 * was really said — only then does it go on to be understood.
 */

/** Below this, WonderHome says what it heard and asks, rather than reading on. */
export const TRANSCRIPT_CONFIDENCE_FLOOR = 0.75;

/** Money or buying — a voice note that asks for either needs a clearer transcript than one that mentions a match on Saturday. */
const CONSEQUENTIAL = /\b(?:pay|paid|payment|transfer|send\s+money|order|buy|purchase|book|cancel|subscribe|renew|inr|rupees?|dollars?)\b|\u20B9|\$\s*\d|\brs\.?\s*\d/i;

/** Where a consequential voice note must sit before it is read on. */
export const CONSEQUENTIAL_CONFIDENCE_FLOOR = 0.9;

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

/** The line the review step shows for an uncertain transcript. */
export function uncertainTranscriptPrompt(gate: Extract<TranscriptGate, { outcome: "uncertain" }>): string {
  return gate.consequential
    ? "This sounds like it asks WonderHome to pay for or order something, and I'm not sure I heard it right. Check what I heard, or type what was said."
    : "I'm not sure I heard this right. Check what I heard, or type what was said.";
}
