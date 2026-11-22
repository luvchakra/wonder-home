import type { DocumentRecord } from "./document";
import type { HomeSendExtraction } from "../../homesend/items";

/** The bills a document proposes that carry a title. */
export function billRecords(records: readonly unknown[] | null): DocumentRecord[] {
  return ((records ?? []) as DocumentRecord[]).filter((record) => record && record.domain === "bill" && typeof record.title === "string" && record.title.trim().length > 0);
}

/** The named lines a receipt was read with, at most 40. */
export function receiptLines(read: Partial<HomeSendExtraction> | null) {
  return (read?.lines ?? []).filter((line) => typeof line?.name === "string" && line.name.trim().length > 0).slice(0, 40);
}

/** Whether an item can be added this way at all; the deadlines step asks only about these. */
export function canAdd(input: { kind: string | null; senderMemberId: string | null; extracted: Partial<HomeSendExtraction> | null; records: readonly unknown[] | null }): boolean {
  const title = input.extracted?.title?.trim();
  if (input.kind === "bill") return Boolean(title) || billRecords(input.records).length > 0;
  if (input.kind === "receipt") return receiptLines(input.extracted).length > 0;
  // A health record is filed for the person who sent it; with nobody (an email), there is no one to file it for.
  if (input.kind === "health_document") return Boolean(title) && Boolean(input.senderMemberId);
  return false;
}
