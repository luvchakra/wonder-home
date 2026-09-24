import type { DocumentRecordDomain, IntakeExtraction } from "../ai/classify-intake";

/**
 * The whole document, as HomeSend read it (Deep Document Understanding 2.0,
 * `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md` §4–13, §20).
 *
 * Wave 3 read a document into one headline record plus a few things to buy.
 * A school notice is rarely one thing: an Annual Day, three rehearsals, a
 * contribution and a pair of white shoes. This is that reading — every
 * household-relevant record across every page, each with the page and the
 * words it came from — kept on the item's understanding so the plan, the
 * review and the receipt all point back at the same evidence.
 *
 * Deterministic over the classifier's already-sanitized output: nothing here
 * calls a model, and nothing here names an id.
 */

/** Where a thing was read: the page, the heading it sat under, and the words (§11). */
export type EvidenceRef = { page: number | null; section: string | null; quote: string };

export type DocumentRecord = {
  /** Stable within one document: "r1", "r2"… in reading order. */
  key: string;
  domain: DocumentRecordDomain;
  title: string;
  schoolKind: string | null;
  subject: string | null;
  /** Who it is for, as the document wrote it — a hint, never an identity. */
  person: string | null;
  /** YYYY-MM-DD, decided by WonderHome from the document's own words. */
  date: string | null;
  /** "HH:MM" on the household's clock, a school item only. */
  time: string | null;
  endTime: string | null;
  billKind: string | null;
  payee: string | null;
  /** Major units (500.00), never paise. */
  amount: number | null;
  currency: string | null;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  notes: string | null;
  change: "new" | "update" | "cancellation";
  evidence: EvidenceRef;
};

export type PageReport = {
  /** Pages the document has, when known (null for plain text). */
  total: number | null;
  read: number | null;
  unreadable: number[];
};

export type DocumentReading = {
  pages: PageReport;
  /** The day the document is dated, when it prints one. */
  issuedOn: string | null;
  records: DocumentRecord[];
};

/**
 * How much of the document was read (§5): the model's own page count when it
 * gave one, else what the file's bytes say. A page the model could not make
 * out is never counted as read.
 */
export function pageReport(extraction: Pick<IntakeExtraction, "pages">, filePages: number | null = null): PageReport {
  const total = extraction.pages?.total ?? filePages ?? null;
  const unreadable = (extraction.pages?.unreadable ?? []).filter((page) => total === null || page <= total);
  return { total, read: total === null ? null : Math.max(0, total - unreadable.length), unreadable };
}

/** "7 of 8 pages read" — or nothing, for content that has no pages. */
export function pagesReadLine(pages: PageReport): string | null {
  if (pages.total === null || pages.read === null || pages.total <= 1) return pages.total === 1 && pages.unreadable.length === 1 ? "The page could not be read" : null;
  if (pages.read === pages.total) return `All ${pages.total} pages read`;
  const which = pages.unreadable.length === 1 ? `page ${pages.unreadable[0]}` : `pages ${pages.unreadable.join(", ")}`;
  return `${pages.read} of ${pages.total} pages read — ${which} could not be made out`;
}

const tidy = (value: string | null | undefined): string | null => (value && value.trim() ? value.trim() : null);

/** One real-world thing, once: the same title on the same day (and for the same person) is the same record said twice. */
function identity(record: Pick<DocumentRecord, "domain" | "title" | "date" | "person">): string {
  return [record.domain, record.title.toLowerCase().replace(/\s+/g, " "), record.date ?? "", (record.person ?? "").toLowerCase()].join("|");
}

/**
 * Every record the document proposes. A reading from before DDU 2.0 — or a
 * model that returned no records — still has its headline item and its
 * needs, and those become records the same way, so one plan serves both.
 */
export function documentRecords(extraction: IntakeExtraction): DocumentRecord[] {
  if (!extraction.readable) return [];
  const records: Omit<DocumentRecord, "key">[] = [];
  if (extraction.records && extraction.records.length > 0) {
    for (const record of extraction.records) {
      records.push({
        domain: record.domain,
        title: record.title,
        schoolKind: record.schoolKind,
        subject: tidy(record.subject),
        person: tidy(record.person),
        date: record.dueDate,
        time: record.dueTime ?? null,
        endTime: record.endTime ?? null,
        billKind: record.billKind,
        payee: tidy(record.payee),
        amount: record.amount,
        currency: tidy(record.currency),
        quantity: record.quantity,
        unit: tidy(record.unit),
        location: tidy(record.location),
        notes: tidy(record.notes),
        change: record.change,
        evidence: { page: record.evidence.page, section: tidy(record.evidence.section), quote: record.evidence.quote },
      });
    }
  } else if (extraction.title && (extraction.kind === "bill" || extraction.kind === "school_item" || extraction.kind === "grocery_item")) {
    const quote = extraction.facts[0]?.evidence ?? "";
    records.push({
      domain: extraction.kind,
      title: extraction.title,
      schoolKind: extraction.schoolKind,
      subject: tidy(extraction.subject),
      person: tidy(extraction.people[0]),
      date: extraction.dueDate,
      time: extraction.dueTime ?? null,
      endTime: extraction.endTime ?? null,
      billKind: extraction.billKind,
      payee: tidy(extraction.payee),
      amount: extraction.amount,
      currency: tidy(extraction.currency),
      quantity: extraction.quantity,
      unit: tidy(extraction.unit),
      location: null,
      notes: tidy(extraction.notes),
      change: extraction.change,
      evidence: { page: null, section: null, quote },
    });
    for (const need of extraction.needs) {
      records.push({
        domain: "grocery_item",
        title: need.title,
        schoolKind: null,
        subject: null,
        person: null,
        date: null,
        time: null,
        endTime: null,
        billKind: null,
        payee: null,
        amount: null,
        currency: null,
        quantity: null,
        unit: null,
        location: null,
        notes: need.reason,
        change: "new",
        evidence: { page: null, section: null, quote: need.reason },
      });
    }
  }

  // The same thing said twice in one document is one record (§20).
  const seen = new Set<string>();
  const unique = records.filter((record) => {
    const key = identity(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.map((record, index) => ({ key: `r${index + 1}`, ...record }));
}

export function documentReading(extraction: IntakeExtraction, filePages: number | null = null): DocumentReading {
  return { pages: pageReport(extraction, filePages), issuedOn: extraction.issuedOn ?? null, records: documentRecords(extraction) };
}
