/**
 * The person's goal (HomeBrain 4.0 §3.10, story 14-030).
 *
 * The same facts answer "when is movie night?", "should we do movie night on
 * Thursday?" and "do we have anything on Thursday?" — but not in the same
 * shape. The goal says which shape: the fact first, the facts that decide it,
 * or yes/no and then the evidence. It also says how far retrieval follows the
 * household graph: a plan or a decision has to fit around everything the day
 * touches, so it goes two links out where a plain question goes one.
 *
 * Rules only, on the question's own words. A question no rule recognises is
 * `find_out`, the plainest shape — never a guess at something more.
 * `remember` and `do` are requests, which HomeTalk's engine acts on (§3.9)
 * before HomeBrain is ever asked; they are read here so a question that is
 * really one of them is not given an answer's shape.
 */

export type Goal = "find_out" | "plan" | "decide" | "check" | "remember" | "do";

const DECIDE = /\b(?:should (?:we|i|he|she|they)|is it (?:a )?(?:good|bad|ok|okay|wise|better)|would it be|which (?:one|day|is better)|better to|worth it|good idea)\b/i;
const PLAN = /\b(?:planning|plan (?:a|an|the|to|for)|let's|lets|i want to|we want to|can we\b.*\b(?:on|this|next|tomorrow|tonight)|how about)\b/i;
const CHECK = /^(?:do|does|did|is|are|was|were|have|has|had)\b|\b(?:do we have|is there|are there|have we|did (?:\w+ )?(?:pay|get|buy|finish|do|send))\b/i;
const REMEMBER = /\b(?:remember that|note that|keep in mind|don't forget that|(?:\w+) (?:likes|loves|hates|is allergic to|doesn't eat|does not eat))\b/i;
const DO = /^(?:please\s+)?(?:add|remove|buy|order|pay|book|schedule|move|cancel|remind|set|put|mark|assign|invite|send|call|make)\b/i;

export function readGoal(question: string): Goal {
  const text = question.trim().replace(/^(?:ok(?:ay)?|so|hey|hi|well|um+|uh+)[,.\s]+/gi, "");
  if (DECIDE.test(text)) return "decide";
  if (PLAN.test(text)) return "plan";
  if (REMEMBER.test(text)) return "remember";
  if (DO.test(text)) return "do";
  if (CHECK.test(text)) return "check";
  return "find_out";
}

/** How many links out retrieval follows for a goal (§3.4 step 3). */
export function hopsFor(goal: Goal): 1 | 2 {
  return goal === "plan" || goal === "decide" ? 2 : 1;
}
