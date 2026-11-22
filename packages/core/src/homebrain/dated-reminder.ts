/**
 * "Add a reminder for Asmi's music exam on 24th" names a dated thing — the
 * exam — and asks to be reminded of it (the owner, 2026-11-22: "i don't see
 * the reminder set on calendar"). The thing itself is recorded where the
 * household keeps such things (a school exam, an event on the Calendar), the
 * same way being told about it is (`file_with_homesend` → `ingestText`), and
 * the reminder the person asked for is set and tied to it. A reminder to do
 * something ("remind me to call mum at 6", "remind me to pack Asmi's bag for
 * the exam") stays a reminder: there is nothing dated to record.
 *
 * HomeBrain's reading, pure: it only says what the dated thing is called. The
 * conversation engine marks the reminder with it; the executor files it
 * through HomeSend's own pipeline, whose reading, bar and Undo decide the rest.
 * Health appointments stay with `conversation/appointment-reading.ts` (the
 * speaker's own is recorded in Health; who someone else's is for is never
 * assumed), and bills with Bills: neither is read here.
 */

/** Things that happen on a day and belong on the household's calendar or a child's school record. */
const DATED_THING =
  /\b(?:exams?|tests?|quiz|olympiad|ptm|parents?[- ]teachers?(?: meeting)?|open house|recital|concert|performance|show|play|match|tournament|competition|contest|race|meet|grading|audition|class|classes|lesson|coaching|practice|tuition|rehearsal|party|birthday|bday|anniversary|wedding|function|ceremony|annual day|sports day|field trip|school trip|trip|picnic|outing|excursion|project|assignment|presentation|submission|interview|meeting|appointment)\b/i;

/** A reminder to do something about the thing is a reminder to do it ("call", "pack", "book"). */
const DOING = /^(?:to\s+)?(?:call|ring|phone|text|message|email|whatsapp|book|buy|get|pick|drop|pack|send|pay|bring|take|collect|carry|prepare|practise|practice|study|revise|check|ask|tell|remind|order|cancel|confirm|renew|make|fill|sign|print|submit|leave|go|wake|start|finish|do|help|give|fetch)\b/i;

/** Health and money live elsewhere (Health, Bills) and are never read here. */
const HEALTH_OR_MONEY =
  /\b(?:doctor|docter|dr\.?|dentist|dental|eye|physio\w*|derma\w*|therap\w*|vaccin\w*|scan|x-?ray|blood test|lab test|paediatrician|pediatrician|clinic|hospital|medicine|medicines|tablet|bill|bills|emi|rent|fees?|premium|insurance|payment|due amount|recharge)\b/i;

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const A_DAY = `(?:today|tonight|(?:the )?day after (?:tomorrow|tmrw)|tomorrow|tmrw|tmr|kal|aaj|parso|(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?|(?:the )?\\d{1,2}(?:st|nd|rd|th)(?: (?:of )?${MONTH})?|\\d{1,2} ${MONTH}|${MONTH} \\d{1,2}(?:st|nd|rd|th)?)(?: (?:morning|afternoon|evening|night))?`;
const A_TIME = "\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.|o'?clock|baje)|noon";
/** A day or time said in the thing's name, with the word that introduces it ("on 24th", "kal", "at 5pm", "24 ko"). */
const SAID_WHEN = new RegExp(`\\s*\\b(?:(?:on|for|at|by|this|next|coming)\\s+)?(?:${A_DAY}|${A_TIME})\\b(?:\\s+(?:ko|hai))?`, "gi");

export type DatedThing = {
  /** How the thing is named in the reply and filed: "Asmi's music exam". */
  title: string;
};

/**
 * The dated thing a reminder request names, or null when it is a plain
 * reminder. `names` are the household's first names, so "asmis" and "Asmi ka"
 * read as "Asmi's".
 */
export function datedThingInReminder(input: { what: string; when: string | null; utterance: string }, names: readonly string[] = []): DatedThing | null {
  const what = input.what.trim().replace(/[.!?]+$/, "");
  if (!what || !input.when) return null;
  if (!DATED_THING.test(what) || DOING.test(what) || HEALTH_OR_MONEY.test(what) || HEALTH_OR_MONEY.test(input.utterance)) return null;
  const title = titleOf(what, names);
  return title ? { title } : null;
}

/** "the asmis music exam on 24th" → "Asmi's music exam"; "Asmi ka music exam" → "Asmi's music exam". */
export function titleOf(what: string, names: readonly string[] = []): string {
  let text = ` ${what} `
    .replace(/^\s*(?:about|for|of|that|the)\s+/i, " ")
    .replace(SAID_WHEN, " ")
    .replace(/\b(?:my|our)\s+(?=\w)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const name of names) {
    const first = name.trim().split(/\s+/)[0];
    if (!first || first.length < 2) continue;
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "asmis", "asmi's", "Asmi ka/ki/ke" → "Asmi's"; "asmi" → "Asmi".
    text = text
      .replace(new RegExp(`\\b${escaped}(?:'s|’s|s)(?![\\w'’])`, "gi"), `${first}'s`)
      .replace(new RegExp(`\\b${escaped}\\s+k[aie]\\b`, "gi"), `${first}'s`)
      .replace(new RegExp(`\\b${escaped}\\b(?!['’])`, "gi"), first);
  }
  text = text.replace(/^(?:the|a|an)\s+/i, "").replace(/\s+(?:the|a|an)$/i, "").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

/**
 * The sentence HomeSend reads, said the way the household tells HomeTalk about
 * a dated thing ("Asmi's music exam is on Tuesday 24 November"), so the one
 * reading decides whether it is a school exam, an event or something else.
 */
export function datedThingSentence(thing: DatedThing, day: string, time: string | null): string {
  return `${thing.title} is on ${day}${time ? ` at ${time}` : ""}`;
}
