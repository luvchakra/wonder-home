import { helpEn } from "../i18n/messages/areas/help/en";
import type { Translate } from "../i18n/translate";
import { FAQ, GUIDE, localizedFaq, localizedGuide, type FaqEntry, type GuideSection } from "./guide";

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
 *
 * **In a person's own language** (story 22-004). `answerQuestionIn` searches
 * the guide in the language the page is shown in, so a question typed in
 * Hindi is matched against the Hindi guide and answered in its words, with
 * the same section ids. It is the same retrieval — no translation, no model —
 * with a tokenizer that reads any script: accented Latin, Devanagari, Arabic,
 * and Chinese (written without spaces, so read in overlapping pairs of
 * characters). The curated keywords stay English, so an English word still
 * helps. English search is unchanged.
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

/**
 * The same, for each other language. English's are kept alongside, because
 * the curated keywords are English and people mix the two.
 */
const STOP_WORDS_IN: Record<string, readonly string[]> = {
  hi: [
    "का", "की", "के", "है", "हैं", "में", "से", "को", "और", "या", "क्या", "कैसे", "मैं", "मेरा",
    "मेरी", "मेरे", "आप", "अपना", "अपनी", "अपने", "यह", "वह", "पर", "तो", "भी", "हो", "कर",
    "करूँ", "करें", "सकता", "सकती", "सकते", "सकूँ", "कौन", "क्यों", "कोई", "एक", "जो", "नहीं",
    "था", "थी", "लिए", "इसे", "इस", "उस", "कि", "ने",
  ],
  mr: [
    "आहे", "आहेत", "मध्ये", "आणि", "किंवा", "मी", "माझा", "माझी", "माझे", "माझ्या", "तुम्ही",
    "तुमचा", "तुमची", "तुमचे", "तुमच्या", "हा", "ही", "हे", "तो", "ती", "ते", "कसे", "कसा", "कशी",
    "काय", "कोण", "शकतो", "शकते", "शकता", "शकतात", "शकेन", "एक", "जे", "नाही", "पण", "तर",
    "का", "ला", "साठी", "मला", "मग",
  ],
  es: [
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "en", "que", "qué",
    "es", "son", "se", "mi", "mis", "tu", "tus", "su", "sus", "lo", "le", "les", "me", "te", "por",
    "para", "con", "cómo", "como", "quién", "quiénes", "puede", "puedo", "hay", "esto", "este",
    "esta", "eso", "si", "no", "más", "muy", "hago", "ya",
  ],
  fr: [
    "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "en", "et", "ou", "est", "sont",
    "que", "qui", "quoi", "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "mon", "ma",
    "mes", "ton", "ta", "tes", "son", "sa", "ses", "votre", "vos", "ce", "cet", "cette", "ces",
    "pour", "par", "avec", "dans", "sur", "comment", "pourquoi", "peut", "peux", "ne", "pas", "se",
    "si", "plus", "très", "qu", "est-ce", "ai", "fais",
  ],
  de: [
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "und",
    "oder", "ist", "sind", "ich", "du", "er", "sie", "es", "wir", "ihr", "mein", "meine", "meinen",
    "meiner", "dein", "deine", "deinen", "wie", "was", "wer", "warum", "wo", "kann", "kannst", "zu",
    "zum", "zur", "mit", "für", "von", "vom", "im", "in", "an", "am", "auf", "bei", "nicht", "auch",
    "so", "sehr", "mich", "mir", "dich", "dir",
  ],
  ar: [
    "في", "من", "إلى", "على", "عن", "مع", "هل", "ما", "ماذا", "كيف", "لماذا", "أنا", "أنت", "هو",
    "هي", "هذا", "هذه", "ذلك", "تلك", "أن", "أو", "لا", "لم", "لن", "يمكن", "يمكنني", "يمكنك", "يمكنه",
    "كل", "قد", "ثم", "إذا", "التي", "الذي",
  ],
  zh: ["可以", "什么", "怎么", "如何", "我们", "我的", "你的", "是否", "这个", "那个", "哪些", "为什", "一个"],
};

export function terms(text: string, language = "en"): string[] {
  if (language !== "en") return termsIn(text, language);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ""))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    // "bills" and "bill" are the same question.
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
}

const HAN = /\p{Script=Han}/u;
const HAN_FUNCTION_CHARACTERS = /[的了吗呢吧啊我你是和与或也]/gu;

/** The same idea as English, for any other script. */
function termsIn(text: string, language: string): string[] {
  const stop = new Set([...STOP_WORDS, ...(STOP_WORDS_IN[language] ?? [])]);
  const out: string[] = [];
  const words = text
    .toLowerCase()
    // Letters, their marks (Devanagari and Arabic vowel signs) and digits;
    // everything else — the apostrophe in "l’argent" included — splits words.
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/);

  for (const word of words) {
    // Chinese is written without spaces: a run of characters is read as
    // overlapping pairs, since most Chinese words are two characters long.
    // Particles and pronouns ("的", "吗", "我") split a run first, so they
    // never pair up with a real word.
    const unspaced = word.replace(HAN_FUNCTION_CHARACTERS, " ").split(" ");
    for (const run of unspaced.flatMap((part) => part.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu) ?? [])) {
      if (HAN.test(run)) {
        for (let i = 0; i + 1 < run.length; i += 1) out.push(run.slice(i, i + 2));
      } else {
        out.push(stem(run, language));
      }
    }
  }

  return out.filter((word) => word.length > 1 && !stop.has(word));
}

/** Just enough stemming that a plural or an attached article does not hide a word. */
function stem(word: string, language: string): string {
  if (language === "ar") {
    // "الفواتير" and "فواتير", "والدفع" and "دفع", are the same word.
    const bare = word.replace(/^(?:و|ف)?(?:بال|كال|لل|ال)/u, "");
    return bare.length >= 2 ? bare : word;
  }
  return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** How rare each term is across the guide, so common words weigh less. */
function inverseFrequency(sections: readonly GuideSection[], language: string): Map<string, number> {
  const seen = new Map<string, number>();
  for (const section of sections) {
    for (const term of new Set(terms(sectionText(section), language))) {
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
  language = "en",
): number {
  const asked = new Set(terms(question, language));
  if (asked.size === 0) return 0;

  // A word in the title or the curated keywords is a much stronger signal
  // that this is the right section than the same word buried in a paragraph.
  const strong = new Set([
    ...terms(section.title, language),
    ...section.keywords.flatMap((keyword) => terms(keyword, language)),
  ]);
  const body = new Set(terms([section.summary, ...section.body].join(" "), language));

  let score = 0;
  for (const term of asked) {
    const weight = weights.get(term) ?? 1;
    if (strong.has(term)) score += weight * 3;
    else if (body.has(term)) score += weight;
  }

  return score / asked.size;
}

function scoreFaq(
  question: string,
  entry: FaqEntry,
  weights: Map<string, number>,
  language: string,
): number {
  const asked = new Set(terms(question, language));
  if (asked.size === 0) return 0;

  const inQuestion = new Set(terms(entry.question, language));
  const inAnswer = new Set(terms(entry.answer, language));

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
  options: {
    guide?: readonly GuideSection[];
    faq?: readonly FaqEntry[];
    /** The language the guide and the question are in; English unless said. */
    language?: string;
    /** What to say when nothing matched, in that language. */
    notFound?: string;
  } = {},
): Answer {
  const guide = options.guide ?? GUIDE;
  const faq = options.faq ?? FAQ;
  const language = options.language ?? "en";
  const weights = inverseFrequency(guide, language);

  const ranked = guide
    .map((section) => ({ section, score: scoreSection(question, section, weights, language) }))
    .sort((a, b) => b.score - a.score);

  const bestFaq = faq
    .map((entry) => ({ entry, score: scoreFaq(question, entry, weights, language) }))
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
    const start = guide.find((section) => section.id === "what-wonderhome-is");
    return {
      reply: options.notFound ?? helpEn["help.ask.notFound"],
      sectionId: "what-wonderhome-is",
      sectionTitle: start?.title ?? helpEn["help.guide.what-wonderhome-is.title"],
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

/**
 * A question answered from the guide in one person's language: their guide,
 * their FAQ, their words for "not found". The ids are the same as English, so
 * every link still lands on its section.
 */
export function answerQuestionIn(question: string, t: Translate, language: string): Answer {
  return answerQuestion(question, {
    guide: localizedGuide(t),
    faq: localizedFaq(t),
    language,
    notFound: t("help.ask.notFound"),
  });
}

const SUGGESTED_KEYS = [
  "help.suggested.spendMoney",
  "help.suggested.quietHome",
  "help.suggested.schoolWork",
  "help.suggested.sendNotice",
  "help.suggested.hindi",
  "help.suggested.data",
] as const satisfies readonly (keyof typeof helpEn)[];

/** Questions offered as starting points, so the box is never a blank stare. */
export function suggestedQuestions(t?: Translate): string[] {
  return SUGGESTED_KEYS.map((key) => (t ? t(key) : helpEn[key]));
}

/** The starting points in English. */
export const SUGGESTED_QUESTIONS = suggestedQuestions();
