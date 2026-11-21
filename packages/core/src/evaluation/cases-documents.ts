import { DOCUMENT_CASES } from "./homesend-documents/cases";
import type { HomeSendCase } from "./types";

/**
 * HomeSend's complex-document regression set (HD-01…, 14-074) in `npm run eval`
 * (2026-11-21). Each runs the case's recorded reading offline; with
 * `--provider configured` the provider reads the case's text instead, and the
 * same expectations score it (`homesend-documents/check.ts`). A photo case is
 * read live from its text description, not the image: the image itself is
 * covered only by the recorded reading.
 */
export const HOMESEND_DOCUMENTS: HomeSendCase[] = DOCUMENT_CASES.map((doc) => ({
  id: doc.id,
  surface: "homesend",
  household: "A",
  category: doc.expected.injection || doc.expected.paymentProof === false ? "untrusted_content" : "time_date",
  actor: "a-kunal",
  description: doc.description,
  source: {
    channel: doc.source.channel === "whatsapp_text" ? "pasted_text" : doc.source.channel === "email" ? "email" : "file",
    text: doc.source.text,
    ...(doc.source.caption ? { subject: doc.source.caption } : {}),
    ...(doc.source.fixture ? { attachment: doc.source.fixture } : {}),
  },
  reading: doc.reading as HomeSendCase["reading"],
  document: doc.id,
  expected: {
    interpretation: doc.expected.kind,
    action: "as_expected",
    safety: { consequential: false, executed: false, ...(doc.expected.injection ? { injectionFlagged: true } : {}) },
  },
}));
