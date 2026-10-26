import type { IntakeExtraction } from "../ai/classify-intake";

/**
 * How sure HomeSend must be before it adds anything on its own (the owner,
 * 2026-10-25): more than 95% — the right category, and every detail read
 * from what was actually sent. Below it, a person confirms first.
 *
 * A model's own "high" is not that. It counts as 0.9 (`understanding.ts`).
 * A reading earns `VERIFIED_CONFIDENCE` only when WonderHome can check it
 * word by word against the text that came in: the kind has what that kind
 * needs, and its name, amount, date, payee and shop are all found there.
 * A photo or a file has no text to check against, so it always waits.
 *
 * Pure: the same reading and text always give the same answer.
 */

/** What a photo or a file leaves unchecked: there are no words of its own to check the reading against. */
export const FROM_A_FILE = "the original, which can't be checked word by word";

/** The default bar for adding an entry on its own: strictly above 95%. An Admin may pick another (`auto-add.ts`). */
export const AUTO_APPLY_FLOOR = 0.95;
/** A high reading whose every detail was found in what was sent. */
export const VERIFIED_CONFIDENCE = 0.97;

export type ReadingCheck = {
  /** Every detail the kind needs is there, and was found in what was sent. */
  verified: boolean;
  /** What could not be checked, in the household's words: "the amount", "the date". Empty when verified. */
  unverified: string[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Lower case, letters and digits only, every other mark a space: "2:30 p.m." and "2.30 pm" share their words. */
function words(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Every number the text writes, with its thousands commas taken out: "₹1,499.00" is 1499. */
function numbers(text: string): number[] {
  return [...text.normalize("NFKC").matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, ""))).filter((value) => Number.isFinite(value));
}

/** Words that say what kind of thing it is, not which: "Water bill" is not found in "electricity bill" by its "bill". */
const GENERIC = new Set([
  "the", "and", "for", "with", "from", "bill", "bills", "payment", "invoice", "due", "amount", "exam", "examination", "test", "event",
  "party", "class", "item", "items", "note", "notice", "reminder", "receipt", "report", "record", "document", "appointment", "meeting",
]);

/** A word that says which thing it is (three letters or more, not a kind) is in the text — a name may be shortened, never invented. */
function named(value: string, found: ReadonlySet<string>): boolean {
  const own = words(value).filter((word) => word.length >= 3 && !/^\d+$/.test(word));
  const telling = own.filter((word) => !GENERIC.has(word));
  const asked = telling.length > 0 ? telling : own.length > 0 ? own : words(value);
  return asked.some((word) => found.has(word));
}

/** Every word of a date phrase is in the text: "Sunday, 9.30 morning" from "…9.30 morning … Sunday". */
function phrased(phrase: string, found: ReadonlySet<string>): boolean {
  const own = words(phrase);
  return own.length > 0 && own.every((word) => found.has(word));
}

/** A day the model gave without its words: its day of the month and its month are both written in the text. */
function dated(iso: string, found: ReadonlySet<string>): boolean {
  const [, month, day] = iso.split("-").map(Number);
  if (!month || !day) return false;
  const dayWritten = [String(day), String(day).padStart(2, "0"), `${day}st`, `${day}nd`, `${day}rd`, `${day}th`].some((form) => found.has(form));
  const name = MONTHS[month - 1]!;
  const monthWritten = [...found].some((word) => word.startsWith(name)) || found.has(String(month)) || found.has(String(month).padStart(2, "0"));
  return dayWritten && monthWritten;
}

/** What each kind needs before it can be an entry at all. */
function missingFor(reading: IntakeExtraction): string[] {
  const missing: string[] = [];
  if (!reading.title?.trim()) missing.push("the name");
  switch (reading.kind) {
    case "bill":
      if (reading.amount === null && !reading.dueDate) missing.push("the amount or due date");
      break;
    case "school_item":
    case "activity_item":
    case "event":
      if (!reading.dueDate) missing.push("the date");
      break;
    case "receipt":
      if (!reading.merchant?.trim()) missing.push("the shop");
      if (reading.lines.length === 0 && reading.amount === null) missing.push("what was bought");
      break;
    case "health_document":
      if (!reading.healthRecordType) missing.push("what kind of record it is");
      break;
    case "grocery_item":
      break;
    default:
      missing.push("what it is");
  }
  return missing;
}

/**
 * Checks a reading against the text it was read from. `sourceText` is the
 * pasted text, the email, the voice note's transcript or the page a link
 * opened — null for a photo or a file, which cannot be checked word by word.
 */
export function checkReading(reading: IntakeExtraction, sourceText: string | null): ReadingCheck {
  if (!reading.readable) return { verified: false, unverified: ["what it is"] };
  const unverified = missingFor(reading);
  if (!sourceText?.trim()) return { verified: false, unverified: [...unverified, FROM_A_FILE] };

  const found = new Set(words(sourceText));
  const written = numbers(sourceText);
  if (reading.title?.trim() && !named(reading.title, found)) unverified.push("the name");
  if (reading.amount !== null && !written.some((value) => Math.abs(value - reading.amount!) < 0.005)) unverified.push("the amount");
  if (reading.payee?.trim() && !named(reading.payee, found)) unverified.push("who it's paid to");
  if (reading.merchant?.trim() && !named(reading.merchant, found)) unverified.push("the shop");
  const day = reading.dueDate ?? reading.documentDate;
  if (reading.dateText?.trim() ? !phrased(reading.dateText, found) : day ? !dated(day, found) : false) unverified.push("the date");

  const distinct = [...new Set(unverified)];
  return { verified: distinct.length === 0, unverified: distinct };
}
