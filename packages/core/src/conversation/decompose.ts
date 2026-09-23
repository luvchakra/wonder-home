/**
 * Multi-step requests (Wave 4 §10):
 *
 *   "Add milk and bananas, and remind me to buy them tomorrow."
 *   "Plan pasta for tonight and make sure we have everything."
 *
 * One sentence, several operations. Each part is understood, grounded, gated
 * and carried out on its own — the same engine as any single request — so
 * one part needing a yes never quietly decides the others.
 *
 * Splitting is deterministic and conservative: a new part begins only where
 * "and", "then", a comma or a full stop is followed by a word that starts a
 * request ("remind", "plan", "make sure", …). "Milk and bananas" stays one
 * list of two things; "mac and cheese" stays one dish.
 *
 * The rule that matters is the premise rule: a later part that leans on an
 * earlier one ("buy *them*", "we have *everything*") only goes ahead when the
 * earlier part actually happened. One that failed, is waiting for a yes, or
 * asked a question is never the premise for what follows it.
 */

/** Words that begin a request of their own. */
const STARTS_A_REQUEST =
  "(?:add|put|remind|plan|make sure|check (?:that|we|if)|book|pay|order|reorder|buy|get|record|mark|move|reschedule|note|remember|schedule|cancel|remove|we need|i need|also)";

const JOINER = new RegExp(`\\s*(?:,\\s*|;\\s*|\\.\\s+)?(?:\\b(?:and then|then|and also|and)\\s+)?(?=\\b${STARTS_A_REQUEST}\\b)`, "gi");

/** At most this many parts from one sentence; anything longer is read as one request. */
export const MAX_PARTS = 4;

/**
 * The parts of a request, in the order they were said. A request with one
 * part comes back as itself.
 */
export function splitRequest(utterance: string): string[] {
  const text = utterance.trim().replace(/[.!]+$/, "");
  if (!text) return [utterance];

  const cuts: number[] = [];
  for (const match of text.matchAll(JOINER)) {
    const at = match.index ?? 0;
    // A cut needs a real joiner in front of it — "and", "then", a comma, a
    // full stop — never the start of the sentence, and never a bare space
    // ("remind me to buy them" must not split at "buy").
    if (at === 0 || match[0].trim() === "") continue;
    cuts.push(at);
  }
  if (cuts.length === 0) return [utterance];

  const parts: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    parts.push(text.slice(start, cut));
    start = cut;
  }
  parts.push(text.slice(start));

  const cleaned = parts
    .map((part) =>
      part
        .replace(/^\s*(?:,|;|\.)?\s*(?:and then|then|and also|and)\s+/i, "")
        .replace(/^\s*[,;.]\s*/, "")
        .replace(/^also\s+/i, "")
        .replace(/[,;.\s]+$/, "")
        .trim(),
    )
    .filter((part) => part.length > 0);

  if (cleaned.length < 2 || cleaned.length > MAX_PARTS) return [utterance];
  // A part too short to be a request on its own ("and get") means the split
  // was wrong; read the whole thing as one request instead.
  if (cleaned.some((part) => part.split(/\s+/).length < 2)) return [utterance];
  return cleaned;
}

/**
 * Whether a part leans on something said earlier in the same request:
 * "remind me to buy *them*", "make sure we have *everything*".
 */
export function leansOnEarlier(part: string): boolean {
  return /\b(?:them|it|that|those|these|this|everything|the same)\b/i.test(part);
}

/** How an earlier part of the same request ended, for the premise rule. */
export type PartOutcome = "done" | "waiting" | "asked" | "failed" | "answered" | "held";

/**
 * Why a later part is held back, or null when it may go ahead. A part that
 * leans on an earlier one waits for every earlier part to have actually
 * happened.
 */
export function heldBecause(part: string, earlier: readonly { part: string; outcome: PartOutcome }[]): string | null {
  if (!leansOnEarlier(part)) return null;
  const blocking = earlier.find((entry) => entry.outcome !== "done" && entry.outcome !== "answered");
  if (!blocking) return null;
  const what = `"${blocking.part}"`;
  switch (blocking.outcome) {
    case "waiting":
      return `I have not done "${part}" yet — it depends on ${what}, which is waiting for your yes. Once that is done, ask me again.`;
    case "asked":
      return `I have not done "${part}" yet — it depends on ${what}, and I asked you something about that first.`;
    case "held":
      return `I have not done "${part}" either — it depends on the parts before it.`;
    default:
      return `I have not done "${part}" — it depends on ${what}, which did not go through.`;
  }
}

/**
 * Partial success, said plainly (Wave 5 §16). After a request with several
 * parts, when some happened and some did not, one closing line says exactly
 * which is which, so nobody has to add it up from the replies above.
 * Returns null when everything went the same way, or when the last thing
 * said was a question (the question must stay last).
 */
export function partialSummary(outcomes: readonly { part: string; outcome: PartOutcome }[]): string | null {
  if (outcomes.length < 2 || outcomes[outcomes.length - 1]!.outcome === "asked") return null;
  const happened = outcomes.filter((entry) => entry.outcome === "done" || entry.outcome === "answered");
  const waiting = outcomes.filter((entry) => entry.outcome === "waiting");
  const notDone = outcomes.filter((entry) => entry.outcome === "failed" || entry.outcome === "held");
  if (notDone.length === 0 || happened.length + waiting.length === 0) return null;
  const quote = (entries: readonly { part: string }[]) => entries.map((entry) => `"${entry.part}"`).join(", ");
  return [
    happened.length > 0 ? `Done: ${quote(happened)}.` : null,
    waiting.length > 0 ? `Waiting for your OK: ${quote(waiting)}.` : null,
    `Not done: ${quote(notDone)}.`,
  ]
    .filter(Boolean)
    .join(" ");
}
