/**
 * How much a memory matters (the amygdala's tag): 0 to 3, decided by rules
 * when it is written and again each night.
 *
 * - 3: health, an allergy, safety, medicine — never fades, never rests.
 * - 2: a rule the household states as one ("always", "never", "must"), or a
 *   constraint about a child.
 * - 1: everyday likes, routines and facts.
 * - 0: nothing a person could agree or disagree with.
 */

export type Salience = 0 | 1 | 2 | 3;

const VITAL = /\b(?:allerg\w*|anaphyla\w*|asthma\w*|diabet\w*|epilep\w*|seizure\w*|insulin|inhaler|epipen|medicin\w*|medication\w*|tablet\w*|dose\w*|doctor\w*|hospital\w*|emergenc\w*|safety|unsafe|danger\w*|choking|peanut\w*|gluten|lactose|intoleran\w*|celiac|coeliac|blood\s+pressure|heart\s+condition)\b/i;
const RULE = /\b(?:always|never|must|mustn'?t|should\s+not|shouldn'?t|not\s+allowed|no\s+one|nobody|every\s+(?:day|night|morning|evening))\b/i;

export function textOfMemory(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.statement === "string") return record.statement;
    return Object.values(record)
      .filter((entry) => typeof entry === "string" || typeof entry === "number")
      .join(" ");
  }
  return String(value);
}

export function salienceOf(memory: { value: unknown; category?: string | null }, about: { isChild: boolean } = { isChild: false }): Salience {
  const value = memory.value as Record<string, unknown> | null;
  const text = textOfMemory(memory.value).trim();
  if (!text) return 0;
  if (value && typeof value === "object" && value.stance === "allergic") return 3;
  if (VITAL.test(text)) return 3;
  if (RULE.test(text)) return 2;
  if (about.isChild && memory.category === "constraint") return 2;
  return 1;
}

/** A memory this important never rests and never expires on its own. */
export function neverFades(salience: number): boolean {
  return salience >= 3;
}
