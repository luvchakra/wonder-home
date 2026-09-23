import type { IntakeExtraction } from "../ai/classify-intake";
import type { InjectionScan } from "./injection";
import type { HomeSendKind, HomeSendSource } from "./items";

/**
 * The canonical result every HomeSend input produces (Wave 3 §8) — a photo,
 * a PDF, a text file, a pasted forward, a web page, a voice note or an email
 * all end here, in one shape, so everything after this point (entity
 * resolution, reconciliation, the review screen, metrics) is written once.
 *
 * Built deterministically from the classifier's structured reading. The
 * model never chooses an action and never names an id: `candidateActions`
 * are derived here, from its `kind`, out of a fixed list, and every string
 * that reached this point has already had any id stripped by
 * `sanitizeIntakeExtraction`.
 */

export const CANDIDATE_ACTION_TYPES = ["add_bill", "add_school_item", "add_grocery_item", "file_health_document", "add_household_need"] as const;
export type CandidateActionType = (typeof CANDIDATE_ACTION_TYPES)[number];

export type ConfidenceWord = "high" | "medium" | "low";

export type UnderstandingEntity = {
  type: "person" | "payee" | "date" | "amount" | "item" | "subject" | "document";
  extractedValue: string;
  confidence: number;
  sourceEvidence: string[];
};

export type UnderstandingFact = { statement: string; confidence: number; sourceEvidence: string[] };

export type CandidateAction = {
  type: CandidateActionType;
  confidence: number;
  fields: Record<string, string | number | null>;
};

export type UnderstandingReference = {
  /** A name as the content wrote it. */
  text: string;
  /** Display names of the household members it could be — filled by entity resolution, never by the model. */
  candidates: string[];
  confidence: number;
};

export type IntakeUnderstanding = {
  readable: boolean;
  kind: HomeSendKind;
  contentSummary: string;
  confidence: ConfidenceWord;
  entities: UnderstandingEntity[];
  facts: UnderstandingFact[];
  candidateActions: CandidateAction[];
  references: UnderstandingReference[];
  /** Whether the content announces a change to something announced before (§10). */
  change: "new" | "update" | "cancellation";
  safety: {
    /** The content addressed WonderHome with instructions; they were ignored (§16). */
    instructionsIgnored: boolean;
    signals: string[];
  };
  provenance: {
    channel: HomeSendSource;
    /** 0–1, for a voice note; null for everything else. */
    transcriptConfidence: number | null;
    url: string | null;
    subject: string | null;
    sender: string | null;
    filename: string | null;
    /** What kind of file it really was, from its bytes. */
    contentType?: string | null;
  };
};

export type UnderstandingMeta = {
  channel: HomeSendSource;
  transcriptConfidence?: number | null;
  url?: string | null;
  subject?: string | null;
  sender?: string | null;
  filename?: string | null;
  contentType?: string | null;
  injection: InjectionScan;
};

const CONFIDENCE_VALUE: Record<ConfidenceWord, number> = { high: 0.9, medium: 0.7, low: 0.4 };

/** The confidence a number stands for, in the words the review screen uses (§13: "Confidence — High"). */
export function confidenceWord(value: number): ConfidenceWord {
  if (value >= 0.85) return "high";
  if (value >= 0.6) return "medium";
  return "low";
}

const ACTION_FOR_KIND: Partial<Record<HomeSendKind, CandidateActionType>> = {
  bill: "add_bill",
  school_item: "add_school_item",
  grocery_item: "add_grocery_item",
  health_document: "file_health_document",
};

function evidenceFor(value: string, facts: IntakeExtraction["facts"]): string[] {
  const lowered = value.toLowerCase();
  return facts.filter((fact) => fact.evidence.toLowerCase().includes(lowered)).map((fact) => fact.evidence).slice(0, 2);
}

/**
 * A reading's overall confidence, adjusted by what the pipeline knows and
 * the model does not: a voice note is only as sure as its transcript, and a
 * reading that found no title at all is not "high" whatever it claims.
 */
export function overallConfidence(extraction: IntakeExtraction, transcriptConfidence: number | null = null): number {
  if (!extraction.readable) return 0;
  let value = CONFIDENCE_VALUE[extraction.confidence];
  if (!extraction.title) value = Math.min(value, CONFIDENCE_VALUE.low);
  if (transcriptConfidence !== null) value = Math.min(value, transcriptConfidence);
  return Math.round(value * 100) / 100;
}

export function buildUnderstanding(extraction: IntakeExtraction, meta: UnderstandingMeta): IntakeUnderstanding {
  const transcriptConfidence = meta.transcriptConfidence ?? null;
  const confidence = overallConfidence(extraction, transcriptConfidence);
  const facts = extraction.facts;

  const entities: UnderstandingEntity[] = [];
  const add = (type: UnderstandingEntity["type"], value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    const text = String(value);
    entities.push({ type, extractedValue: text, confidence, sourceEvidence: evidenceFor(text, facts) });
  };
  for (const person of extraction.people) add("person", person);
  if (extraction.subjectMemberName && !extraction.people.includes(extraction.subjectMemberName)) add("person", extraction.subjectMemberName);
  add("payee", extraction.payee);
  add("date", extraction.dueDate ?? extraction.documentDate);
  add("amount", extraction.amount !== null ? `${extraction.amount}${extraction.currency ? ` ${extraction.currency}` : ""}` : null);
  add("subject", extraction.subject);
  if (extraction.kind === "grocery_item") add("item", extraction.title);
  if (extraction.kind === "health_document") add("document", extraction.healthRecordType);

  const candidateActions: CandidateAction[] = [];
  const primary = ACTION_FOR_KIND[extraction.kind];
  if (extraction.readable && primary && extraction.title) {
    candidateActions.push({
      type: primary,
      confidence,
      fields: {
        title: extraction.title,
        notes: extraction.notes,
        billKind: extraction.billKind,
        payee: extraction.payee,
        amount: extraction.amount,
        currency: extraction.currency,
        dueDate: extraction.dueDate,
        schoolKind: extraction.schoolKind,
        subject: extraction.subject,
        quantity: extraction.quantity,
        unit: extraction.unit,
        category: extraction.category,
        healthRecordType: extraction.healthRecordType,
        documentDate: extraction.documentDate,
      },
    });
  }
  // Each implied need is its own proposal, separately confirmed and
  // separately undoable (§11) — and never more sure than the reading it
  // came from.
  for (const need of extraction.needs) {
    candidateActions.push({ type: "add_household_need", confidence: Math.min(confidence, CONFIDENCE_VALUE.medium), fields: { title: need.title, reason: need.reason } });
  }

  return {
    readable: extraction.readable,
    kind: extraction.kind,
    contentSummary: extraction.summary ?? extraction.title ?? "",
    confidence: confidenceWord(confidence),
    entities,
    facts: facts.map((fact) => ({ statement: fact.statement, confidence, sourceEvidence: fact.evidence ? [fact.evidence] : [] })),
    candidateActions,
    references: extraction.people.map((name) => ({ text: name, candidates: [], confidence: 0 })),
    change: extraction.change,
    safety: { instructionsIgnored: meta.injection.flagged, signals: meta.injection.signals },
    provenance: {
      channel: meta.channel,
      transcriptConfidence,
      url: meta.url ?? null,
      subject: meta.subject ?? null,
      sender: meta.sender ?? null,
      filename: meta.filename ?? null,
      contentType: meta.contentType ?? null,
    },
  };
}

/** The understanding of content nobody could read — kept, so the item still says where it came from and why it is waiting. */
export function unreadableUnderstanding(meta: UnderstandingMeta): IntakeUnderstanding {
  return {
    readable: false,
    kind: "unknown",
    contentSummary: "",
    confidence: "low",
    entities: [],
    facts: [],
    candidateActions: [],
    references: [],
    change: "new",
    safety: { instructionsIgnored: meta.injection.flagged, signals: meta.injection.signals },
    provenance: {
      channel: meta.channel,
      transcriptConfidence: meta.transcriptConfidence ?? null,
      url: meta.url ?? null,
      subject: meta.subject ?? null,
      sender: meta.sender ?? null,
      filename: meta.filename ?? null,
      contentType: meta.contentType ?? null,
    },
  };
}
