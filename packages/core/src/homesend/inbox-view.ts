import type { DirectAdd } from "./auto-add";
import type { HomeSendItem, HomeSendSource } from "./items";

/**
 * How the calm HomeSend page (the owner, 2026-11-03) arranges what is there:
 * identical waiting items folded into one row, a short human name for an item
 * that couldn't be read (never its raw scraped text), and what "Add all
 * anyway" would do with each waiting item. Pure, so the page, the server
 * action and the tests read the same rules.
 */

// --- Grouping identical waiting items ---------------------------------------

type Groupable = Pick<HomeSendItem, "id" | "classifiedKind" | "extracted" | "understanding" | "subject" | "sourceUrl" | "rawText">;

/** The words two items must share to be "the same": kind and name, spaces and case aside. */
export function sameKey(item: Groupable): string | null {
  const name = item.extracted?.title?.trim() || item.understanding?.contentSummary?.trim() || item.subject?.trim() || item.sourceUrl?.trim() || "";
  if (!name) return null;
  return `${item.classifiedKind ?? "unknown"}|${name.replace(/\s+/g, " ").toLocaleLowerCase()}`;
}

export type WaitingGroupRow<T> = { key: string; first: T; items: T[] };

/**
 * One row per distinct item, in the order the first of each arrived: five
 * "Swag Labs product listing" become one row of five. An item with no name
 * is never folded into another.
 */
export function groupIdentical<T extends Groupable>(items: readonly T[]): WaitingGroupRow<T>[] {
  const rows: WaitingGroupRow<T>[] = [];
  const byKey = new Map<string, WaitingGroupRow<T>>();
  for (const item of items) {
    const key = sameKey(item);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const row = { key: key ?? `id|${item.id}`, first: item, items: [item] };
    rows.push(row);
    if (key) byKey.set(key, row);
  }
  return rows;
}

// --- A short name for what couldn't be read ---------------------------------

/** The closed names a failed item is shown by; worded per language as `homesend.failedTitle.<key>`. */
export const FAILED_TITLES = ["webPage", "link", "photo", "pdf", "voiceNote", "email", "whatsapp", "message", "file"] as const;
export type FailedTitle = (typeof FAILED_TITLES)[number];

/** Text that reads like a copied web page: a menu, a list of products, lines of navigation — or simply very long. */
function looksLikeAPage(text: string): boolean {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length > 400) return true;
  return /\b(open menu|add to cart|sign in|log ?in|sort by|products?|home \| |menu)\b/i.test(flat) && flat.split(" ").length > 25;
}

/**
 * What a failed item is, in a few words, from where it came and what kind of
 * file it was: "A pasted web page", "A photo", "A PDF". Never its own text —
 * the raw content stays inside the row's detail (rule 15).
 */
export function failedTitleKey(item: Pick<HomeSendItem, "source" | "contentType" | "rawText" | "sourceUrl">): FailedTitle {
  const type = (item.contentType ?? "").toLowerCase();
  const source: HomeSendSource = item.source;
  if (source === "link" || (item.sourceUrl && source !== "pasted_text")) return "link";
  if (source === "audio_note" || type.startsWith("audio/")) return "voiceNote";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "photo";
  if (source === "email" || source === "email_attachment") return "email";
  if (source === "whatsapp" || source === "whatsapp_media") return "whatsapp";
  if (source === "pasted_text" || source === "school_channel") return item.rawText && looksLikeAPage(item.rawText) ? "webPage" : "message";
  return "file";
}

// --- "Add all anyway" --------------------------------------------------------

/** Why "Add all anyway" leaves a waiting item where it is: only the guards no button may pass. */
export type KeptBecause = "money_switch_off" | "health_switch_off" | "outside_sender" | "unclear";

export type AddAnywayVerdict = { add: true } | { add: false; because: KeptBecause };

/**
 * What "Add all anyway" does with one waiting item, before anything is read
 * again: a bill or receipt while "Add money entries directly" is off, or a
 * health document while "Add health entries directly" is off, keeps waiting;
 * so does anything that arrived by email from outside the household (the
 * owner, 2026-11-03), and so does anything HomeSend couldn't tell the kind
 * of — there is nowhere to file it. Everything else is tried, and may still
 * be kept if the write needs something it doesn't have (a name, who it's for).
 */
export function addAnywayVerdict(item: Pick<HomeSendItem, "source" | "classifiedKind">, directAdd: DirectAdd): AddAnywayVerdict {
  if (item.source === "email" || item.source === "email_attachment") return { add: false, because: "outside_sender" };
  // Nothing to add it as: HomeSend couldn't tell a bill from a school notice, so no button can file it.
  if (!item.classifiedKind || item.classifiedKind === "unknown") return { add: false, because: "unclear" };
  // The same split `auto-add.ts` `directAddAreaOf` makes, kept here so the screen's bundle stays free of the reading code.
  const kind = item.classifiedKind;
  const area = kind === "bill" || kind === "receipt" ? "money" : kind === "health_document" ? "health" : null;
  if (area === "money" && !directAdd.money) return { add: false, because: "money_switch_off" };
  if (area === "health" && !directAdd.health) return { add: false, because: "health_switch_off" };
  return { add: true };
}

/** What the confirm says before anything happens: how many would be added and how many keep waiting, and why. */
export type AddAnywayCounts = { add: number; bills: number; health: number; outside: number; unclear: number };

export function addAnywayCounts(items: readonly Pick<HomeSendItem, "source" | "classifiedKind">[], directAdd: DirectAdd): AddAnywayCounts {
  const counts: AddAnywayCounts = { add: 0, bills: 0, health: 0, outside: 0, unclear: 0 };
  for (const item of items) {
    const verdict = addAnywayVerdict(item, directAdd);
    if (verdict.add) counts.add += 1;
    else if (verdict.because === "money_switch_off") counts.bills += 1;
    else if (verdict.because === "health_switch_off") counts.health += 1;
    else if (verdict.because === "unclear") counts.unclear += 1;
    else counts.outside += 1;
  }
  return counts;
}

/** The most "Add all anyway" or "Archive all" touches in one run (every list has a bound). */
export const CLEAR_ALL_LIMIT = 200;

/** A reason line opens with a capital, whatever the language's words start with. */
export function sentenceCase(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}
