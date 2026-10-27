import type { RawPortalItem, ScrapeTarget } from "./fetch-connection";

/**
 * Generic extraction from a rendered portal page (story 08-033).
 *
 * With no portal-specific knowledge, we do not guess how to split a page into
 * individual homeworks — a crude splitter would flood HomeSend with fragments.
 * Instead the whole rendered page is filed as one item, and HomeSend's own
 * understanding turns that text into the right entry, awaiting confirmation. A
 * provider adapter (e.g. loop-learning) can return properly-split items later.
 *
 * Dedup is by day: the item carries the fetch date, so a page files at most once
 * per day (the twice-daily run and "Fetch now" taps collapse), and a changed
 * page the next day is a new item. A blank or too-short page yields nothing.
 */

const MIN_CONTENT = 40;
const MAX_DETAIL = 12_000;
const MAX_TITLE = 120;

/** The fetch day (UTC) as YYYY-MM-DD — the dedup granularity for a generic page. */
function fetchDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function extractGenericItems(text: string, target: ScrapeTarget, now: Date = new Date()): RawPortalItem[] {
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length < MIN_CONTENT) return []; // blank, a login wall, or nothing worth filing
  const firstLine = clean
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 2);
  const title = (firstLine || `${target.kind} update`).slice(0, MAX_TITLE);
  return [
    {
      title,
      kind: target.kind,
      childMemberId: target.childMemberId,
      dueOn: fetchDay(now),
      detail: clean.slice(0, MAX_DETAIL),
      sourceUrl: target.url,
    },
  ];
}
