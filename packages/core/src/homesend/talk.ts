import type { ContentClass } from "../ai/privacy";
import { tokens } from "../context/normalize";
import { receiptText, type IntakeChangeReceipt, type ReceiptChange } from "./apply";
import type { HomeSendChange, HomeSendItem } from "./items";

/**
 * What HomeTalk says about a document (Deep Document Understanding 2.0
 * §31–33). The same file through HomeTalk and HomeSend goes through the same
 * pipeline, plan and writes; only the words differ, and the words come from
 * what actually happened — the stored receipt and the change rows undo reads
 * — never from what a model read in the document.
 */

type DocumentItem = Pick<HomeSendItem, "id" | "understanding" | "receipt" | "subject" | "createdAt"> & { extracted?: HomeSendItem["extracted"] };

/** "the 2-page notice", "the document" — what the document was, in a few words. */
function documentWords(item: DocumentItem): string {
  const pages = item.understanding?.document?.pages.total ?? null;
  const kind = item.understanding?.kind === "bill" ? "bill" : item.understanding?.kind === "school_item" ? "school notice" : "document";
  return pages && pages > 1 ? `the ${pages}-page ${kind}` : `the ${kind}`;
}

/**
 * The reply posted into the conversation once a document's plan has been
 * applied from HomeTalk (§32): what was read, then the receipt — "Done.
 * Updated: • Annual Day — 12 Oct → 15 Oct …".
 */
export function documentReplyText(item: DocumentItem): string | null {
  const receipt = item.receipt;
  if (!receipt) return null;
  const found = receipt.changes.length;
  const lead = `I read ${documentWords(item)} and found ${found} ${found === 1 ? "thing" : "things"} for your household.`;
  return `${lead}\n\n${receiptText(receipt)}`;
}

/** What a receipt's content could carry, for the reply-language gate: bills are financial, school things are about a child. */
export function documentReplyClasses(receipt: IntakeChangeReceipt | null | undefined): ContentClass[] {
  const classes = new Set<ContentClass>(["general"]);
  for (const change of receipt?.changes ?? []) {
    if (change.domain === "bill") classes.add("financial");
    if (change.domain === "school_item") classes.add("child");
  }
  return [...classes];
}

const QUESTION = /^(?:so\s+)?what\s+(?:did|has|have)\s+(?:the|that|this|my|our|your)?\s*(.+?)\s+(?:change|changed|do|done|add|added|update|updated)(?:\s+(?:for us|in the house(?:hold)?|at home))?\s*\??$/i;
const DOCUMENT_WORDS = /\b(?:notice|circular|letter|document|pdf|file|email|mail|message|bill|invoice|statement|forward|photo|screenshot|thing i sent|upload)\b/i;

/**
 * "What did the school notice change?", "what did that PDF add?" — a question
 * about what a document did, read by rules only. Anything else is not one:
 * "what did Asmi change?" is not about a document.
 */
export function readDocumentChangeQuestion(utterance: string): { about: string } | null {
  const match = QUESTION.exec(utterance.trim());
  if (!match) return null;
  const about = match[1]!.trim();
  return DOCUMENT_WORDS.test(about) ? { about } : null;
}

const GENERIC = new Set(["notice", "circular", "letter", "document", "pdf", "file", "email", "mail", "message", "forward", "photo", "screenshot", "upload", "sent", "thing", "i", "the", "that", "this", "last", "latest", "new"]);

/** The applied document the question is about: the newest whose words match, or the newest at all when the question names nothing more specific. */
function documentFor(items: readonly DocumentItem[], about: string): DocumentItem | null {
  const applied = items.filter((item) => item.receipt).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const wanted = tokens(about).filter((word) => !GENERIC.has(word));
  if (wanted.length === 0) return applied[0] ?? null;
  const scored = applied
    .map((item) => {
      const text = [item.understanding?.contentSummary, item.subject, item.extracted?.title, item.understanding?.kind === "school_item" ? "school" : item.understanding?.kind === "bill" ? "bill" : null].filter(Boolean).join(" ");
      const words = new Set(tokens(text));
      return { item, score: wanted.filter((word) => words.has(word)).length };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item ?? null;
}

function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function changeWords(change: ReceiptChange): string {
  if (change.action === "updated") {
    const moves = change.fields.map((field) => (field.field === "date" ? `moved ${change.title} from ${field.before ?? "no date"} to ${field.after}` : `changed ${change.title}'s ${field.label.toLowerCase()} from ${field.before ?? "nothing"} to ${field.after}`));
    return joinAnd(moves) || `updated ${change.title}`;
  }
  if (change.action === "cancelled") return `cancelled ${change.title}`;
  return `added ${change.title}${change.reason && change.reason !== "Added." ? ` (${change.reason})` : ""}`;
}

/**
 * The answer to "what did it change?" (§33), from the receipt as it stands
 * today: a change someone has since undone is said to have been undone, not
 * repeated as if it still held. Null when no applied document fits — the
 * question then goes on to HomeBrain like any other.
 */
export function answerDocumentChanges(
  items: readonly DocumentItem[],
  changes: readonly Pick<HomeSendChange, "id" | "undoneAt">[],
  about: string,
): { text: string; receipt: IntakeChangeReceipt } | null {
  const item = documentFor(items, about);
  const receipt = item?.receipt;
  if (!item || !receipt) return null;
  const text = changesText(item, receipt, changes);
  return { text, receipt };
}

function changesText(item: DocumentItem, receipt: IntakeChangeReceipt, changes: readonly Pick<HomeSendChange, "id" | "undoneAt">[]): string {
  const undone = new Set(changes.filter((change) => change.undoneAt).map((change) => change.id));
  const written = receipt.changes.filter((change) => change.changeId && (change.action === "created" || change.action === "updated" || change.action === "cancelled"));
  const live = written.filter((change) => !undone.has(change.changeId!));
  const unchanged = receipt.changes.filter((change) => change.action === "unchanged").length;
  const failed = receipt.changes.filter((change) => change.action === "failed");
  const subject = documentWords(item).replace(/^the /, "The ");

  if (written.length === 0) {
    return `${subject} didn't change anything${unchanged > 0 ? ` — ${unchanged === 1 ? "the one thing in it was" : `all ${unchanged} things in it were`} already on record` : ""}.`;
  }
  if (live.length === 0) return `${subject} changed ${written.length === 1 ? "one thing" : `${written.length} things`}, but ${written.length === 1 ? "it was" : "they were all"} undone since — nothing from it is on record now.`;

  const sentences = [`${subject} ${joinAnd(live.map(changeWords))}.`];
  const since = written.length - live.length;
  if (since > 0) sentences.push(`${since === 1 ? "One more change was" : `${since} more changes were`} undone since.`);
  if (unchanged > 0) sentences.push(`${unchanged === 1 ? "One thing was" : `${unchanged} things were`} already on record.`);
  if (failed.length > 0) sentences.push(`${joinAnd(failed.map((change) => change.title))} could not be added.`);
  return sentences.join(" ");
}
