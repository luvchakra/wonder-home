/**
 * HomeSend as WonderHome models it (Phase C).
 *
 * Shapes only — the DB round trip lives in `repository.ts`. Kept as its own
 * file the same way `school/items.ts` is split from `school/repository.ts`.
 */

export const HOME_SEND_SOURCES = ["manual_upload", "pasted_text"] as const;
export type HomeSendSource = (typeof HOME_SEND_SOURCES)[number];

export const HOME_SEND_STATUSES = ["received", "classified", "routed", "dismissed"] as const;
export type HomeSendStatus = (typeof HOME_SEND_STATUSES)[number];

export const HOME_SEND_KINDS = ["bill", "school_item", "grocery_item", "unknown"] as const;
export type HomeSendKind = (typeof HOME_SEND_KINDS)[number];

/** Whatever the classifier read — the confirm screen's prefill, never written to a domain table directly. */
export type HomeSendExtraction = {
  title: string | null;
  notes: string | null;
  billKind: string | null;
  payee: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  schoolKind: string | null;
  subject: string | null;
  quantity: number | null;
  unit: string | null;
  category: string | null;
};

export type HomeSendItem = {
  id: string;
  householdId: string;
  createdByMemberId: string;
  source: HomeSendSource;
  filePath: string | null;
  rawText: string | null;
  status: HomeSendStatus;
  classifiedKind: HomeSendKind | null;
  extracted: HomeSendExtraction | null;
  routedTable: string | null;
  routedId: string | null;
  createdAt: string;
};
