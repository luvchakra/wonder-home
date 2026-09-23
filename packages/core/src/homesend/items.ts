import type { IntakeUnderstanding } from "./understanding";

/**
 * HomeSend as WonderHome models it (Phase C).
 *
 * Shapes only — the DB round trip lives in `repository.ts`. Kept as its own
 * file the same way `school/items.ts` is split from `school/repository.ts`.
 */

export const HOME_SEND_SOURCES = ["manual_upload", "pasted_text", "email", "audio_note", "link", "email_attachment"] as const;
export type HomeSendSource = (typeof HOME_SEND_SOURCES)[number];

export const HOME_SEND_STATUSES = ["received", "classified", "routed", "dismissed", "undone", "failed"] as const;
export type HomeSendStatus = (typeof HOME_SEND_STATUSES)[number];

/** Why an item failed safely (Wave 3 §14): kept, never classified, and listed under "Failed safely". */
export const HOME_SEND_FAILURE_REASONS = [
  "security_rejected",
  "unsupported_type",
  "unreadable",
  "too_large",
  "link_blocked",
  "link_unreachable",
  "transcription_unavailable",
  "transcription_failed",
] as const;
export type HomeSendFailureReason = (typeof HOME_SEND_FAILURE_REASONS)[number];

/** What the inbox says for each — plain, and never which internal check tripped beyond what helps. */
export const FAILURE_REASON_COPY: Record<HomeSendFailureReason, string> = {
  security_rejected: "Didn't pass the safety check, so WonderHome kept it without looking inside.",
  unsupported_type: "WonderHome can't read this kind of file yet.",
  unreadable: "WonderHome couldn't read anything in it.",
  too_large: "Too large to read.",
  link_blocked: "That link isn't a public web page, so WonderHome didn't open it.",
  link_unreachable: "That link couldn't be opened.",
  transcription_unavailable: "Voice notes need a speech service, and none is set up yet.",
  transcription_failed: "WonderHome couldn't make out the voice note.",
};

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
  // Wave 3 (§8). Optional: items classified before it carry none of these.
  summary?: string | null;
  people?: string[];
  needs?: HomeSendSecondaryExtraction[];
  change?: "new" | "update" | "cancellation";
  confidence?: "high" | "medium" | "low";
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
  /** What kind of file it really is, decided from its bytes. */
  contentType: string | null;
  contentHash: string | null;
  /** The address a link item was sent as. */
  sourceUrl: string | null;
  /** An email's subject line. */
  subject: string | null;
  /** The email an attachment came with. */
  parentItemId: string | null;
  /** The canonical reading (`understanding.ts`), null until understood. */
  understanding: IntakeUnderstanding | null;
  transcriptConfidence: number | null;
  failureReason: HomeSendFailureReason | null;
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

/** What routing did to a domain record (Wave 3 §10): made a new one, or updated or cancelled one already on record. */
export const HOME_SEND_CHANGE_TYPES = ["created", "updated", "cancelled"] as const;
export type HomeSendChangeType = (typeof HOME_SEND_CHANGE_TYPES)[number];

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
  changeType: HomeSendChangeType;
  /** For an update or a cancellation: the fields as they were, which undo restores. */
  previous: Record<string, unknown> | null;
};
