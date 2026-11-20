/**
 * A time of day as people say it, typed or spoken (2026-11-20 review of
 * HomeTalk's understanding: "add a reminder for tomorrow doctor appointment
 * at 1 o'clock" asked "What time should I remind you?", because "1 o'clock"
 * was not a time this code could read).
 *
 * Reads "1", "1pm", "1 p.m.", "13:00", "1.30", "1 o'clock", "one o clock",
 * "half past 6", "quarter to 7", "6 thirty", "7 in the evening", "noon",
 * "midnight". Pure; never guesses a time nobody said.
 *
 * With no am/pm, the half of the day comes from what was said around it
 * (`hint`: "tonight", "dinner", "this morning"), else the plausible one for a
 * household: 7–11 is the morning, 12 is noon, 1–6 the afternoon or evening.
 * `assumed` says the half was chosen, so a reply can say so ("I took 1
 * o'clock as 1pm") and one word puts it right.
 */

export type DayHalfHint = "morning" | "afternoon" | "evening" | "night" | null;

export type TimeOfDay = { hour: number; minute: number; /** The am/pm was chosen, not said. */ assumed: boolean };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, thirty: 30, "forty five": 45, "forty-five": 45, fortyfive: 45,
};

const MORNING = /\b(?:morning|breakfast|subah|savere)\b/;
const AFTERNOON = /\b(?:afternoon|lunch|dopahar)\b/;
const EVENING = /\b(?:evening|tonight|dinner|supper|shaam|sham)\b/;
const NIGHT = /\b(?:night|raat)\b/;

/** The half of the day the words around a time point to, if any ("tomorrow evening", "for dinner"). */
export function dayHalfOf(text: string | null | undefined): DayHalfHint {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (EVENING.test(lower)) return "evening";
  if (NIGHT.test(lower)) return "night";
  if (AFTERNOON.test(lower)) return "afternoon";
  if (MORNING.test(lower)) return "morning";
  return null;
}

export function readTimeOfDay(raw: string, options: { hint?: DayHalfHint } = {}): TimeOfDay | null {
  let said = raw
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.,!?]+$/g, "")
    .replace(/^(?:at|around|about|by|approx(?:imately)?)\s+/, "")
    .replace(/\s+(?:sharp|or so)$/, "")
    .trim();
  if (!said) return null;

  // The half of the day said inside the time itself.
  let meridiem: "am" | "pm" | null = null;
  const half = /\s*(?:in the |at |this |tomorrow |)\b(morning|afternoon|evening|night)$/.exec(said);
  let ownHint: DayHalfHint = null;
  if (half) {
    ownHint = half[1] as DayHalfHint;
    said = said.slice(0, half.index).trim();
  }
  const marked = /\s*\b(a\.?\s?m\.?|p\.?\s?m\.?)$/.exec(said) ?? /(?<=\d)\s*(a\.?m\.?|p\.?m\.?)$/.exec(said);
  if (marked) {
    meridiem = marked[1]!.startsWith("a") ? "am" : "pm";
    said = said.slice(0, marked.index).trim();
  }
  said = said.replace(/\s*'?\s?o'?\s?clock$/, "").replace(/\s*baje$/, "").trim();

  if (said === "noon" || said === "midday" || said === "12 noon") return { hour: 12, minute: 0, assumed: false };
  if (said === "midnight") return { hour: 0, minute: 0, assumed: false };

  let hour: number | null = null;
  let minute = 0;
  const words = said.replace(/-/g, " ");
  const relative = /^(half|quarter) (past|to) (.+)$/.exec(words);
  if (relative) {
    const base = numberOf(relative[3]!);
    if (base === null || base < 1 || base > 12) return null;
    const offset = relative[1] === "half" ? 30 : 15;
    if (relative[2] === "past") {
      hour = base;
      minute = offset;
    } else {
      if (relative[1] === "half") return null;
      hour = base === 1 ? 12 : base - 1;
      minute = 60 - offset;
    }
  } else {
    const digits = /^(\d{1,2})(?:\s*[:.h]\s*(\d{2})|\s+(\d{2}))?$/.exec(said);
    if (digits) {
      hour = Number(digits[1]);
      minute = Number(digits[2] ?? digits[3] ?? "0");
    } else {
      const spoken = /^(\d{1,2}|[a-z]+)(?:\s+(fifteen|thirty|forty five|fortyfive|o five|\d{2}))?$/.exec(words);
      if (!spoken) return null;
      const base = numberOf(spoken[1]!);
      if (base === null || base < 1 || base > 12) return null;
      hour = base;
      const tail = spoken[2];
      minute = !tail ? 0 : tail === "o five" ? 5 : /^\d+$/.test(tail) ? Number(tail) : NUMBER_WORDS[tail] ?? 0;
    }
  }
  if (hour === null || hour > 23 || minute > 59) return null;

  if (meridiem) {
    if (hour > 12) return meridiem === "pm" ? { hour, minute, assumed: false } : null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour, minute, assumed: false };
  }
  if (hour === 0 || hour >= 12) return { hour, minute, assumed: false };

  const hint = ownHint ?? options.hint ?? null;
  if (hint === "morning") return { hour, minute, assumed: false };
  if (hint === "afternoon" || hint === "evening") return { hour: hour + 12, minute, assumed: false };
  if (hint === "night") return hour <= 4 ? { hour, minute, assumed: false } : { hour: hour + 12, minute, assumed: false };
  // No word for the half of the day: the plausible one, and said so.
  return hour >= 7 ? { hour, minute, assumed: true } : { hour: hour + 12, minute, assumed: true };
}

/** The other half of the day for a time whose am/pm was chosen — "1pm" ↔ "1am" — for rolling a time already past. */
export function otherHalf(time: TimeOfDay): TimeOfDay {
  return { hour: (time.hour + 12) % 24, minute: time.minute, assumed: true };
}

function numberOf(text: string): number | null {
  const trimmed = text.trim();
  if (/^\d{1,2}$/.test(trimmed)) return Number(trimmed);
  return NUMBER_WORDS[trimmed] ?? null;
}

/** The pattern the rules use to find a time in a sentence: digits, spoken hours, o'clock, half past, noon. */
export const TIME_PHRASE =
  "(?:(?:half|quarter)\\s+(?:past|to)\\s+(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|\\d{1,2}(?:[:.]\\d{2})?\\s*(?:o'?\\s?clock|baje)?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\\s+(?:thirty|fifteen|forty[- ]five))?\\s*(?:o'?\\s?clock)?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|noon|midday|midnight)(?:\\s+(?:in the )?(?:morning|afternoon|evening|at night))?";
