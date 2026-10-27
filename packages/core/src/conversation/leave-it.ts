/**
 * "Skip", "leave it", "never mind", "no thanks", "that's enough": the person
 * would rather leave what HomeTalk just asked about. One list, read by every
 * question that has a sensible "leave it" (the amount, a HomeSend detail, the
 * offer to fill details in, and any other question, which then closes with
 * nothing done). The owner, 2026-10-27: a tapped "Skip" to "How much maps
 * link should I add?" became a HomeSend item and failed safely.
 */
const LEAVE_IT =
  /^(?:skip|skip it|skip this|skip that|leave it|leave it as it is|leave it there|leave them|leave that|never ?mind|forget it|forget about it|no thanks?|no,? thank you|no need|enough|that'?s enough|it'?s enough|that'?s all|that'?s fine|fine as it is|not now)(?:,?\s*(?:thanks|thank you|please))?$/i;

/** Whether the whole reply is a "leave it" (case, a trailing full stop or "!" and a "thanks" aside). Pure. */
export function isLeaveIt(utterance: string): boolean {
  const said = utterance.normalize("NFC").trim().replace(/[’]/g, "'").replace(/[.!]+$/, "").trim();
  return said.length > 0 && said.length <= 40 && LEAVE_IT.test(said);
}

/** The reply when a question is left: polite, and says nothing was done. */
export const LEFT_AS_IT_IS = "Okay, I've left it as it is. Nothing was added or changed.";

/** The reply to a "leave it" when nothing was asked and nothing waits for a yes. */
export const NOTHING_TO_LEAVE = "Okay. Nothing is waiting on you, so I've left everything as it is.";
