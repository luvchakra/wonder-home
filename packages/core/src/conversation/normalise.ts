/**
 * Hearing it right (HomeBrain 4.0 §3.1, story 14-024).
 *
 * People do not speak in the sentences rules are written for. Gemini Live
 * passed on, word for word, "Okay, so. Okay, who are the family members in
 * this household?" — and the roster rule, written for "who are the family
 * members?", never saw that question (the owner's report, 2026-10-18).
 *
 * So every utterance is cleaned into one canonical sentence before anything
 * reads it: spoken lead-ins ("okay, so", "um", "hey WonderHome"), polite
 * wrappers ("can you tell me…", "I want to know…"), a word said twice, and
 * "please / thanks" at the end. The rules, retrieval and the model read the
 * canonical sentence; the person's own words stay on the record and in the
 * chat.
 *
 * Conservative by construction:
 * - a sentence that is nothing but a lead-in ("okay", "yes, sure") comes
 *   back unchanged — it is a short reply, and the short-reply reader needs it;
 * - only what is at the very start or the very end is removed, never a word
 *   in the middle of the request;
 * - nothing that changes meaning ("not", "don't", names, amounts) is ever on
 *   a list here.
 *
 * Pure: the same words always clean the same way.
 */

export type Normalised = {
  /** The sentence the rules, retrieval and the model read. */
  canonical: string;
  /** What was taken off, in order, for the record and tests. */
  stripped: string[];
  /**
   * The person asked WonderHome to look again ("can you check the WonderHome
   * database and find out?"). Read by HomeBrain's deeper look (phase 2,
   * 14-026); on its own it changes nothing.
   */
  deeper: boolean;
};

/** Words that open a spoken sentence without meaning anything. */
const LEAD_INS = [
  "okay so",
  "ok so",
  "alright so",
  "all right so",
  "right so",
  "well so",
  "so",
  "okay",
  "ok",
  "okey",
  "alright",
  "all right",
  "um",
  "umm",
  "uh",
  "uhh",
  "er",
  "erm",
  "hmm",
  "hm",
  "well",
  "right",
  "yeah so",
  "hey",
  "hi",
  "hello",
  "listen",
  "look",
  "wonderhome",
  "wonder home",
  "hometalk",
  "home talk",
  "hey wonderhome",
  "hey wonder home",
  "hey hometalk",
];

/** Words that wrap a request without being part of it. Longest first. */
const WRAPPERS = [
  "can you please tell me",
  "could you please tell me",
  "can you tell me",
  "could you tell me",
  "would you tell me",
  "will you tell me",
  "please tell me",
  "tell me",
  "i want to know",
  "i would like to know",
  "i'd like to know",
  "i wanted to know",
  "do you know",
  "do you have any idea",
  "any idea",
];

/** "Can you check the WonderHome database and find out?" — the person asking to look again. */
const DEEPER =
  /^(?:but |so |then |and )?(?:you )?(?:(?:can|could|would|will) you |please )*(?:check|look(?: it up)?|search|go through|look through|look in|look into|dig into)(?: (?:in|into|through))? (?:the )?(?:wonder ?home|home ?talk|your|the|our)?\s*(?:database|records?|data|system|app|details)?(?:\s*(?:and|to) (?:find out|tell me|check|see|look))?(?: again)?$/i;

const PLANNING =
  /^(?:(?:i am|i'm|im|we are|we're|i was|we were)\s+(?:planning|thinking of planning|hoping to plan)(?:\s+(?:to have|to do|on|for))?|(?:i|we)\s+(?:want|would like|'d like|wanna)\s+to\s+plan|let'?s\s+plan|(?:i|we)\s+plan\s+to\s+have)\s+(?=\S)/i;

const TAIL = /(?:[\s,]+(?:please|for me|thanks|thank you|now|right now))+$/i;

export function normaliseUtterance(utterance: string): Normalised {
  const original = utterance.trim();
  const stripped: string[] = [];
  let text = original;

  // A word said twice in a row is said once ("can you can you", "the the").
  text = text.replace(/\b(\w+(?:\s+\w+)?)(?:\s+\1\b)+/gi, (match, words: string) => {
    stripped.push(match);
    return words;
  });

  // Lead-ins, as many as were said ("Okay, so. Okay, …"), with their punctuation.
  for (let guard = 0; guard < 6; guard += 1) {
    const lead = leadIn(text);
    if (!lead) break;
    stripped.push(lead.word);
    text = lead.rest;
  }

  const deeper = DEEPER.test(text.replace(/[?.!]+$/, "").trim());

  // A wrapper only goes when a question or request follows it.
  const lower = text.toLowerCase();
  for (const wrapper of WRAPPERS) {
    if (lower.startsWith(`${wrapper} `)) {
      const rest = text.slice(wrapper.length).replace(/^[\s,:]+/, "");
      if (rest.split(/\s+/).length >= 2) {
        stripped.push(wrapper);
        text = rest;
      }
      break;
    }
  }

  // "I am planning a movie night on Friday" is a plan, said as news: the
  // same request as "plan a movie night on Friday" (the owner's report,
  // 2026-10-18). Only a plan's own verbs, and only at the start.
  const plan = text.match(PLANNING);
  if (plan) {
    stripped.push(plan[0].trim());
    text = `Plan ${text.slice(plan[0].length)}`;
  }

  const tail = text.replace(/[?.!]+$/, "").match(TAIL);
  if (tail && tail.index !== undefined && tail.index > 0) {
    const ending = text.match(/[?.!]+$/)?.[0] ?? "";
    stripped.push(tail[0].trim());
    text = `${text.replace(/[?.!]+$/, "").slice(0, tail.index)}${ending}`;
  }

  text = text.replace(/\s{2,}/g, " ").trim();
  // Nothing left but what was stripped: it was a short reply ("okay"), kept as said.
  if (!/[a-z0-9]/i.test(text)) return { canonical: original, stripped: [], deeper: false };
  // A sentence whose start was taken off begins with a capital again; one
  // that only lost a repeated word keeps the case it was said in.
  const startChanged = !original.toLowerCase().startsWith(text.toLowerCase().slice(0, Math.min(text.length, 12)));
  return { canonical: startChanged ? capitalise(text) : text, stripped, deeper };
}

function leadIn(text: string): { word: string; rest: string } | null {
  const lower = text.toLowerCase();
  // Longest first, so "okay so" goes before "okay"; the words of a lead-in
  // may be said with a comma between them ("Okay, so.").
  for (const word of [...LEAD_INS].sort((a, b) => b.length - a.length)) {
    const said = lower.match(new RegExp(`^${word.split(" ").join("[\\s,]+")}`));
    if (!said) continue;
    const after = text.slice(said[0].length);
    // A whole word, followed by punctuation or a space — "so" is not the start of "soup".
    const boundary = after.match(/^(?:[\s]*[,.!;:\-–—]+[\s]*|\s+)/);
    if (!boundary) continue;
    const rest = after.slice(boundary[0].length);
    if (!/[a-z0-9]/i.test(rest)) return null;
    // "So" and "right" and "well" can start a real sentence ("right now…", "well water"):
    // only strip them when a comma or full stop says they were filler, or a question follows.
    if (["so", "right", "well", "look", "listen"].includes(word) && !/[,.!;:\-–—]/.test(boundary[0]) && !startsQuestion(rest)) continue;
    return { word, rest };
  }
  return null;
}

const QUESTION_START = /^(?:who|what|when|where|which|why|how|is|are|do|does|did|can|could|will|would|should|shall|have|has|tell|list|show|add|remind|plan|put|buy|get|book|pay|order|set|make|remember|schedule|cancel|remove|i|we|my|our)\b/i;

function startsQuestion(text: string): boolean {
  return QUESTION_START.test(text.trim());
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
