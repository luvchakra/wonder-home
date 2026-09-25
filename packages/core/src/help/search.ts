import { FAQ, GUIDE, type FaqEntry, type GuideSection } from "./guide";

/**
 * Answering a question from the guide.
 *
 * This is retrieval, and it says so. No language model is involved: it scores
 * the question against the guide and hands back the passage that best matches
 * along with a link to the section it came from. That is a smaller promise
 * than a model makes, and unlike a model it cannot invent a feature
 * WonderHome does not have — which for a help screen is the more important
 * property. `CLAUDE.md` also forbids claiming an integration that is not
 * configured, and no model key is required for this to work.
 *
 * The ranking is deliberately simple enough to reason about when it gets an
 * answer wrong: rarer words count for more, the title and the curated
 * keywords count for more than the body, and an FAQ entry that matches wins
 * over a section, because somebody has already written the short answer.
 */

export type Answer = {
  /** What to say. Either a curated FAQ answer or the section's own summary. */
  reply: string;
  /** Where the answer came from, for the "read more" link. */
  sectionId: string;
  sectionTitle: string;
  /** Other sections worth offering, best first. */
  alsoSee: { id: string; title: string }[];
  /** False when nothing matched well enough to claim an answer. */
  confident: boolean;
};

/** Words too common to tell two guide sections apart. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for", "from",
  "has", "have", "how", "i", "if", "in", "is", "it", "me", "my", "not", "of", "on", "or", "our",
  "that", "the", "their", "then", "there", "they", "this", "to", "was", "what", "when", "where",
  "which", "who", "why", "will", "with", "you", "your", "get", "got",
]);

export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ""))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    // "bills" and "bill" are the same question.
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/** How rare each term is across the guide, so common words weigh less. */
function inverseFrequency(sections: readonly GuideSection[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const section of sections) {
    for (const term of new Set(terms(sectionText(section)))) {
      seen.set(term, (seen.get(term) ?? 0) + 1);
    }
  }

  const weights = new Map<string, number>();
  for (const [term, count] of seen) {
    weights.set(term, Math.log(1 + sections.length / count));
  }
  return weights;
}

function sectionText(section: GuideSection): string {
  return [section.title, section.summary, ...section.body, ...section.keywords].join(" ");
}

export function scoreSection(
  question: string,
  section: GuideSection,
  weights: Map<string, number>,
): number {
  const asked = new Set(terms(question));
  if (asked.size === 0) return 0;

  // A word in the title or the curated keywords is a much stronger signal
  // that this is the right section than the same word buried in a paragraph.
  const strong = new Set([...terms(section.title), ...section.keywords.flatMap(terms)]);
  const body = new Set(terms([section.summary, ...section.body].join(" ")));

  let score = 0;
  for (const term of asked) {
    const weight = weights.get(term) ?? 1;
    if (strong.has(term)) score += weight * 3;
    else if (body.has(term)) score += weight;
  }

  return score / asked.size;
}

function scoreFaq(question: string, entry: FaqEntry, weights: Map<string, number>): number {
  const asked = new Set(terms(question));
  if (asked.size === 0) return 0;

  const inQuestion = new Set(terms(entry.question));
  const inAnswer = new Set(terms(entry.answer));

  let score = 0;
  for (const term of asked) {
    const weight = weights.get(term) ?? 1;
    if (inQuestion.has(term)) score += weight * 3;
    else if (inAnswer.has(term)) score += weight;
  }
  return score / asked.size;
}

/** Below this, nothing has really matched and saying so beats guessing. */
export const CONFIDENCE_FLOOR = 0.55;

export function answerQuestion(
  question: string,
  options: { guide?: readonly GuideSection[]; faq?: readonly FaqEntry[] } = {},
): Answer {
  const guide = options.guide ?? GUIDE;
  const faq = options.faq ?? FAQ;
  const weights = inverseFrequency(guide);

  const ranked = guide
    .map((section) => ({ section, score: scoreSection(question, section, weights) }))
    .sort((a, b) => b.score - a.score);

  const bestFaq = faq
    .map((entry) => ({ entry, score: scoreFaq(question, entry, weights) }))
    .sort((a, b) => b.score - a.score)[0];

  const best = ranked[0];
  const alsoSee = ranked
    .slice(1)
    .filter((entry) => entry.score > CONFIDENCE_FLOOR)
    .slice(0, 2)
    .map((entry) => ({ id: entry.section.id, title: entry.section.title }));

  // Somebody has already written the short answer to this one; prefer it.
  if (bestFaq && best && bestFaq.score >= best.score && bestFaq.score > CONFIDENCE_FLOOR) {
    const section = guide.find((entry) => entry.id === bestFaq.entry.section) ?? best.section;
    return {
      reply: bestFaq.entry.answer,
      sectionId: section.id,
      sectionTitle: section.title,
      alsoSee: alsoSee.filter((entry) => entry.id !== section.id),
      confident: true,
    };
  }

  if (!best || best.score <= CONFIDENCE_FLOOR) {
    return {
      reply:
        "I could not find that in the guide. Try naming the part of the home you mean — bills, school, meals, notifications, privacy — or browse the sections below.",
      sectionId: "what-wonderhome-is",
      sectionTitle: "What WonderHome is",
      alsoSee: [],
      confident: false,
    };
  }

  return {
    reply: `${best.section.summary} ${best.section.body[0] ?? ""}`.trim(),
    sectionId: best.section.id,
    sectionTitle: best.section.title,
    alsoSee,
    confident: true,
  };
}

/** Questions offered as starting points, so the box is never a blank stare. */
export const SUGGESTED_QUESTIONS = [
  "Can WonderHome spend money without asking?",
  "Why is my home screen so quiet?",
  "Who can see my children's school work?",
  "How do I send WonderHome a school notice?",
  "Can I use WonderHome in Hindi?",
  "How do I download or delete my data?",
];
