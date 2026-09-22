/**
 * The one safety net a health-issue description ever gets (story 21-003).
 *
 * A fixed, deterministic keyword check — never a model call, never a
 * diagnosis engine. WonderHome does not decide what is wrong; the strongest
 * thing this can ever produce is a recommendation to seek medical attention,
 * and even that is phrased as a suggestion, never an instruction.
 */

const CONCERNING_PATTERNS: readonly RegExp[] = [
  /chest pain/i,
  /can'?t breathe|trouble breathing|difficulty breathing|shortness of breath/i,
  /severe (pain|bleeding|headache|allergic)/i,
  /heavy bleeding|won'?t stop bleeding/i,
  /unconscious|passed out|fainted/i,
  /suicidal|self[- ]harm/i,
  /high fever|fever (of |over )?(10[3-9]|1[1-9]\d)/i,
  /seizure/i,
  /anaphyla/i,
  /broken bone|compound fracture/i,
  /poison(ed|ing)?/i,
];

export type MedicalAttentionAssessment = {
  recommend: boolean;
  /** Fixed, non-diagnostic phrasing — never specific to what was typed. */
  message: string | null;
};

const RECOMMENDATION_MESSAGE =
  "This sounds like it could be serious. Consider seeking medical attention if it hasn't already been looked at.";

/** Scans free text for a fixed list of concerning phrases — nothing inferred, nothing diagnosed. */
export function assessForMedicalAttention(...texts: readonly (string | null | undefined)[]): MedicalAttentionAssessment {
  const combined = texts.filter((text): text is string => Boolean(text)).join(" ");
  const recommend = CONCERNING_PATTERNS.some((pattern) => pattern.test(combined));
  return { recommend, message: recommend ? RECOMMENDATION_MESSAGE : null };
}
