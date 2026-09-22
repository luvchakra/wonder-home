/**
 * HomeSend as WonderHome models it (Phase C).
 *
 * Shapes only — the DB round trip lives in `repository.ts`. Kept as its own
 * file the same way `school/items.ts` is split from `school/repository.ts`.
 */

export const HOME_SEND_SOURCES = ["manual_upload", "pasted_text", "email"] as const;
export type HomeSendSource = (typeof HOME_SEND_SOURCES)[number];

export const HOME_SEND_STATUSES = ["received", "classified", "routed", "dismissed", "undone"] as const;
export type HomeSendStatus = (typeof HOME_SEND_STATUSES)[number];

export const HOME_SEND_KINDS = ["bill", "school_item", "grocery_item", "health_document", "unknown"] as const;
export type HomeSendKind = (typeof HOME_SEND_KINDS)[number];

/** Whether a manual_upload's bytes actually matched the content type it claimed. Pasted text has no file, so it is always not_applicable. */
export const HOME_SEND_SECURITY_STATUSES = ["not_applicable", "clean", "rejected"] as const;
export type HomeSendSecurityStatus = (typeof HOME_SEND_SECURITY_STATUSES)[number];

/** The one domain the HomeSend confirm form may write into (bill, school work, a grocery item or a health record). */
export const HOME_SEND_CHANGE_DOMAINS = ["bill", "school_item", "grocery_item", "health_document"] as const;
export type HomeSendChangeDomain = (typeof HOME_SEND_CHANGE_DOMAINS)[number];

/** A second, different-domain need the same content also implies — see `ai/classify-intake.ts`'s `SecondaryProposalSchema`. Always a grocery suggestion; never written until the household confirms it too. */
export type HomeSendSecondaryExtraction = {
  reason: string;
  title: string;
};

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
  healthRecordType: string | null;
  documentDate: string | null;
  subjectMemberName: string | null;
  secondary: HomeSendSecondaryExtraction | null;
};

export type HomeSendItem = {
  id: string;
  householdId: string;
  /** Null only for `source: "email"` — nobody in the household typed this in. */
  createdByMemberId: string | null;
  source: HomeSendSource;
  filePath: string | null;
  rawText: string | null;
  status: HomeSendStatus;
  classifiedKind: HomeSendKind | null;
  extracted: HomeSendExtraction | null;
  routedTable: string | null;
  routedId: string | null;
  securityStatus: HomeSendSecurityStatus;
  /** The provider's own message id, for idempotent re-delivery. Only set for `source: "email"`. */
  externalId: string | null;
  /** Who sent it in, for an email. Never a household member's own address by design. */
  senderAddress: string | null;
  createdAt: string;
};

export const HOME_SEND_ADDRESS_STATUSES = ["active", "revoked"] as const;
export type HomeSendAddressStatus = (typeof HOME_SEND_ADDRESS_STATUSES)[number];

/** The household's own inbound HomeSend email address. */
export type HomeSendAddress = {
  id: string;
  householdId: string;
  address: string;
  status: HomeSendAddressStatus;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
};

/** What routing an item actually wrote — the record undo reverses. */
export type HomeSendChange = {
  id: string;
  householdId: string;
  intakeId: string;
  domain: HomeSendChangeDomain;
  entityId: string;
  createdByMemberId: string;
  createdAt: string;
  undoneAt: string | null;
  undoneByMemberId: string | null;
};
