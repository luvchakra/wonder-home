/**
 * A household recipe, said as a message someone else can cook from (the
 * owner, 2026-10-20: "give option to share user recipe with others … keep
 * descriptive message. WhatsApp share should have description picture and
 * message").
 *
 * Pure: the screen passes in the recipe and its words in the reader's
 * language, and gets back one plain-text message — a heading, a line of what
 * it takes, what you need, how to make it, and a closing line. Nothing about
 * the household (who cooks, when it is planned) is ever in it.
 */

export type ShareableRecipe = {
  name: string;
  totalMinutes: number;
  serves: number;
  caloriesPerServing?: number | null;
  proteinGrams?: number | null;
  method?: string | null;
  essentials: readonly { name: string; quantity: number; unit: string }[];
  optional: readonly string[];
};

export type RecipeShareWords = {
  /** "{minutes} min · serves {serves}" */
  timeServes: string;
  /** "{kcal} kcal · {protein}g protein per serving" */
  perServing: string;
  /** "{kcal} kcal per serving" */
  kcalOnly: string;
  needs: string;
  optional: string;
  steps: string;
  closing: string;
  /** A unit's name by its key ("bunch"); weights and volumes keep their symbol. */
  unitName: (unit: string) => string;
  number: (value: number) => string;
};

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

/** The recipe's method as numbered steps: one per line, or per sentence when it is one paragraph. */
export function methodSteps(method: string | null | undefined): string[] {
  const text = (method ?? "").trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9ऀ-෿])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function recipeShareText(recipe: ShareableRecipe, words: RecipeShareWords): string {
  const amount = (quantity: number, unit: string) => `${words.number(quantity)} ${["g", "kg", "ml", "l"].includes(unit) ? unit : words.unitName(unit)}`.trim();
  const lines: string[] = [`🍽️ ${recipe.name}`, fill(words.timeServes, { minutes: recipe.totalMinutes, serves: recipe.serves })];
  if (recipe.caloriesPerServing !== null && recipe.caloriesPerServing !== undefined) {
    lines.push(
      recipe.proteinGrams !== null && recipe.proteinGrams !== undefined
        ? fill(words.perServing, { kcal: words.number(recipe.caloriesPerServing), protein: words.number(recipe.proteinGrams) })
        : fill(words.kcalOnly, { kcal: words.number(recipe.caloriesPerServing) }),
    );
  }
  if (recipe.essentials.length > 0) {
    lines.push("", `${words.needs}:`, ...recipe.essentials.map((line) => (line.unit === "unit" ? `• ${line.name}` : `• ${line.name} — ${amount(line.quantity, line.unit)}`)));
  }
  if (recipe.optional.length > 0) lines.push(`${words.optional}: ${recipe.optional.join(", ")}`);
  const steps = methodSteps(recipe.method);
  if (steps.length > 0) lines.push("", `${words.steps}:`, ...steps.map((step, index) => `${index + 1}. ${step}`));
  lines.push("", words.closing);
  return lines.join("\n");
}
