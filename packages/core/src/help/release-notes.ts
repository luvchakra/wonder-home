/**
 * Release notes: what reached the household in each version, newest first,
 * on Get help (`/help#release-notes`).
 *
 * An entry is written when the owner confirms a version is live, never
 * before (help rule: never describe a planned feature as available). It
 * covers, at a high level, every pull request merged after the previous
 * entry's `throughPr` up to its own: one line per feature a household would
 * notice, in the UI's own labels, not a changelog of fixes. Unlike What's new
 * (`help/whats-new.ts`, temporary by construction), an entry stays: it is the
 * record.
 *
 * The words are `help.release.<id>.title` and `help.release.<id>.item.N` in
 * every help catalog, counted from English like the guide's paragraphs, so
 * they stay with the guide outside the catalogs that reach the browser
 * (`help/words.ts`).
 */
import { englishHelp, helpEn, type HelpKey, type HelpWords } from "./words";

export type ReleaseNoteShape = {
  /** Stable name for the entry; its words are `help.release.<id>.*`. */
  id: string;
  /** The day the owner confirmed it live (YYYY-MM-DD). */
  date: string;
  /** The first and last pull requests it covers; the next entry starts after `throughPr`. */
  fromPr: number;
  throughPr: number;
};

export type ReleaseNote = ReleaseNoteShape & { title: string; items: string[] };

/** Newest first. Add the next entry at the top, starting after the first entry's `throughPr`. */
export const RELEASE_NOTES: readonly ReleaseNoteShape[] = [
  // Version 0.1, confirmed live by the owner on 2026-10-21.
  { id: "0.1", date: "2026-10-21", fromPr: 243, throughPr: 283 },
  { id: "2026-10-19", date: "2026-10-19", fromPr: 201, throughPr: 242 },
];

/** An entry's item keys, `item.1` onwards, counted from the English source. */
function itemKeys(id: string): HelpKey[] {
  const keys: HelpKey[] = [];
  for (let n = 1; `help.release.${id}.item.${n}` in helpEn; n += 1) {
    keys.push(`help.release.${id}.item.${n}` as HelpKey);
  }
  return keys;
}

/** Every entry in one person's language, English by default. */
export function localizedReleaseNotes(t: HelpWords = englishHelp): ReleaseNote[] {
  return RELEASE_NOTES.map((entry) => ({
    ...entry,
    title: t(`help.release.${entry.id}.title` as HelpKey),
    items: itemKeys(entry.id).map((key) => t(key)),
  }));
}
