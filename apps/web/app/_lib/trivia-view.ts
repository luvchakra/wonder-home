import type { Pick, TriviaLevel } from "@wonderhome/core/school/trivia";
import { CATEGORY_TOPIC } from "@wonderhome/core/school/trivia-repository";

/** One Kids Trivia card as the browser gets it: words and choices, nothing about the household. */
export type TriviaView = {
  shownId: string | null;
  cardKey: string;
  kind: "fact" | "quiz";
  text: string;
  options: string[];
  answer: number | null;
  explain: string | null;
  /** The child's own topic, or null when the card is from a built-in category instead. */
  topic: string | null;
  category: string;
  /** The child's topics with no cards yet (said honestly on the card). */
  uncovered: string[];
  streak: number;
  level: TriviaLevel;
  language: string;
};

export function toTriviaView(input: { pick: Pick; shownId: string | null; uncovered: readonly string[]; streak: number; level: TriviaLevel }): TriviaView {
  const { card, topic } = input.pick;
  return {
    shownId: input.shownId,
    cardKey: card.key,
    kind: card.kind,
    text: card.text,
    options: [...(card.options ?? [])],
    answer: card.answer ?? null,
    explain: card.explain ?? null,
    topic: topic.startsWith(CATEGORY_TOPIC) ? null : topic,
    category: card.category,
    uncovered: [...input.uncovered],
    streak: input.streak,
    level: input.level,
    language: card.language,
  };
}
