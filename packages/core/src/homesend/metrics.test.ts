import { describe, expect, it } from "vitest";

import { summarizeHomeSend, type MetricsItemRow } from "./metrics";

function row(over: Partial<MetricsItemRow>): MetricsItemRow {
  return {
    source: "pasted_text",
    status: "classified",
    classified_kind: "school_item",
    review_decision: null,
    review_proposal: null,
    review_subject: null,
    review_corrected: null,
    created_at: "2026-09-23T08:00:00Z",
    routed_at: null,
    ...over,
  };
}

const ROWS: MetricsItemRow[] = [
  // Added as read, for a child named in it, in 10 minutes.
  row({ status: "routed", review_decision: "added", review_subject: "resolved", review_corrected: false, routed_at: "2026-09-23T08:10:00Z" }),
  // "Who is this for?" had to be asked; the person also fixed the date; 30 minutes.
  row({ status: "routed", review_decision: "added", review_subject: "asked", review_corrected: true, routed_at: "2026-09-23T08:30:00Z" }),
  // The Science Exhibition moved: reconciliation offered an update, accepted; 2 minutes.
  row({ status: "routed", review_decision: "updated", review_proposal: "update", review_subject: "resolved", review_corrected: false, routed_at: "2026-09-23T08:02:00Z" }),
  // Already on record; the person kept the existing one.
  row({ status: "dismissed", review_decision: "kept_existing", review_proposal: "duplicate", review_subject: "resolved" }),
  // A grocery ask the household's own setting let WonderHome add; 1 minute.
  row({ source: "manual_upload", status: "routed", classified_kind: "grocery_item", review_decision: "auto_added", review_subject: "not_needed", review_corrected: false, routed_at: "2026-09-23T08:01:00Z" }),
  // Not worth adding.
  row({ status: "dismissed", classified_kind: "bill", review_decision: "dismissed" }),
  // Waiting on a person.
  row({ source: "email", status: "classified", classified_kind: "bill" }),
  // Read, but not recognised.
  row({ source: "link", status: "classified", classified_kind: "unknown" }),
  // Failed safely: a link to a private address, never read.
  row({ source: "link", status: "failed", classified_kind: null }),
  // Just arrived, not read yet.
  row({ source: "audio_note", status: "received", classified_kind: null }),
];

describe("HomeSend metrics (Wave 3 §19)", () => {
  const metrics = summarizeHomeSend(ROWS, [{ undone_at: null }, { undone_at: null }, { undone_at: "2026-09-23T09:00:00Z" }, { undone_at: null }], {
    windowDays: 30,
    queueDepth: 2,
  });

  it("counts intake by source", () => {
    expect(metrics.intakeBySource).toEqual({ pasted_text: 5, manual_upload: 1, email: 1, link: 2, audio_note: 1 });
  });

  it("measures parsing against what was actually read, never against what is still waiting to be", () => {
    // 9 read (the audio note is still "received"); 7 recognised (not the unknown link, not the failed one).
    expect(metrics.parsingSuccess).toEqual({ count: 7, of: 9 });
  });

  it("measures entity resolution and ambiguity over reviews where who it was for mattered", () => {
    expect(metrics.entityResolution).toEqual({ count: 3, of: 4 });
    expect(metrics.ambiguity).toEqual({ count: 1, of: 4 });
  });

  it("measures duplicate detection, proposal acceptance and correction over reviews", () => {
    expect(metrics.duplicateDetection).toEqual({ count: 2, of: 6 });
    expect(metrics.proposalAcceptance).toEqual({ count: 4, of: 6 });
    // Only items a person confirmed count toward corrections — an auto-added one had nobody to correct it.
    expect(metrics.correction).toEqual({ count: 1, of: 3 });
  });

  it("counts writes that stood, rejections kept safely and the queue waiting on a person", () => {
    expect(metrics.downstreamWriteSuccess).toEqual({ count: 3, of: 4 });
    expect(metrics.safeRejection).toEqual({ count: 1, of: 10 });
    expect(metrics.queueDepth).toBe(2);
  });

  it("times arrival to a useful outcome", () => {
    expect(metrics.timeToOutcomeMinutes).toEqual({ median: 2, p90: 30, of: 4 });
  });

  it("says nothing it cannot count", () => {
    const empty = summarizeHomeSend([], [], { windowDays: 7, queueDepth: 0 });
    expect(empty.parsingSuccess).toEqual({ count: 0, of: 0 });
    expect(empty.timeToOutcomeMinutes).toEqual({ median: null, p90: null, of: 0 });
  });
});
