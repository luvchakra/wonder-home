import { describe, expect, it } from "vitest";

import { decideConfirmation, type ConfirmationInput } from "./confirmation";
import { FROM_A_FILE } from "./verify";
import { bulkReady, countWaiting, daysBetween, isDueForArchive, isStale, retryState, RETRY_CAP, whyItWaits, type WaitEvidence } from "./waiting";

const understanding = (over: Partial<NonNullable<ConfirmationInput["understanding"]>> = {}) => ({
  readable: true,
  confidence: "high" as const,
  safety: { instructionsIgnored: false, signals: [] as string[] },
  score: 0.9,
  check: { verified: true, unverified: [] as string[] },
  ...over,
});

/** The evidence a review would carry, decided by the real confirmation rule — never a hand-written decision. */
function evidence(over: Partial<ConfirmationInput> & { plan?: boolean } = {}): WaitEvidence {
  const input: ConfirmationInput = {
    kind: "school_item",
    extracted: { title: "Science exhibition", dueDate: "2026-11-20", confidence: "high", needs: [] },
    understanding: understanding() as ConfirmationInput["understanding"],
    reconciliation: null,
    subject: { question: null, selected: { memberId: "asmi", displayName: "Asmi" } } as ConfirmationInput["subject"],
    memberInitiated: true,
    autonomy: "prepare",
    ...over,
  };
  const confirmation = decideConfirmation(input);
  return {
    kind: input.kind,
    extracted: input.extracted as WaitEvidence["extracted"],
    understanding: input.understanding as WaitEvidence["understanding"],
    reconciliation: input.reconciliation as WaitEvidence["reconciliation"],
    confirmation,
    plan: over.plan ?? false,
    memberInitiated: input.memberInitiated,
  };
}

describe("bulk review: one yes among several (the owner, 2026-11-03)", () => {
  it("lets a complete school notice for a known child be added with others", () => {
    expect(bulkReady(evidence())).toBe(true);
  });

  it("never takes a bill or health document while the Admin's 'add directly' setting is off", () => {
    expect(bulkReady(evidence({ kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-10", confidence: "high", needs: [] } }))).toBe(false);
    expect(bulkReady(evidence({ kind: "health_document", extracted: { title: "Blood test", healthRecordType: "lab_report", confidence: "high", needs: [] } }))).toBe(false);
  });

  it("takes a bill only when the Admin already lets money entries in directly", () => {
    const bill = { kind: "bill" as const, extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-10", confidence: "high" as const, needs: [] } };
    expect(bulkReady(evidence({ ...bill, directAdd: { money: true, health: false } }))).toBe(true);
  });

  it("never takes a photo or file, whatever else is true", () => {
    expect(bulkReady(evidence({ understanding: understanding({ check: { verified: false, unverified: [FROM_A_FILE] } }) as ConfirmationInput["understanding"] }))).toBe(false);
  });

  it("never takes a receipt: its lines are chosen on its own form", () => {
    expect(bulkReady(evidence({ kind: "receipt", extracted: { title: "Big Bazaar", merchant: "Big Bazaar", documentDate: "2026-11-01", confidence: "high", needs: [] }, directAdd: { money: true, health: false } }))).toBe(false);
  });

  it("never takes something missing a detail, unsure who it is for, a possible duplicate, several things, or instructions", () => {
    expect(bulkReady(evidence({ extracted: { title: "Science exhibition", confidence: "high", needs: [] } }))).toBe(false);
    expect(bulkReady(evidence({ subject: { question: "Who is it for — Asmi or Manan?", selected: null } as ConfirmationInput["subject"] }))).toBe(false);
    expect(
      bulkReady(evidence({ reconciliation: { message: "I found Asmi's Science Exhibition", proposal: { type: "duplicate" }, existing: { title: "Science Exhibition" } } as unknown as ConfirmationInput["reconciliation"] })),
    ).toBe(false);
    expect(bulkReady(evidence({ plan: true }))).toBe(false);
    expect(bulkReady(evidence({ extracted: { title: "Science exhibition", dueDate: "2026-11-20", confidence: "high", needs: [{ reason: "for the model", title: "chart paper" }] } }))).toBe(false);
    expect(bulkReady(evidence({ understanding: understanding({ safety: { instructionsIgnored: true, signals: [] } }) as ConfirmationInput["understanding"] }))).toBe(false);
    expect(bulkReady(evidence({ kind: "unknown" }))).toBe(false);
  });
});

describe("why it waits, in a few words from evidence", () => {
  it("names a photo, a missing amount, a duplicate and the household's bar", () => {
    expect(whyItWaits(evidence({ understanding: understanding({ check: { verified: false, unverified: [FROM_A_FILE] } }) as ConfirmationInput["understanding"] }))).toEqual({ code: "photo" });
    expect(whyItWaits(evidence({ kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", dueDate: "2026-11-10", confidence: "high", needs: [] } }))).toEqual({ code: "amount" });
    const duplicate = evidence({ reconciliation: { message: "found", proposal: { type: "duplicate" }, existing: { title: "Science Exhibition" } } as unknown as ConfirmationInput["reconciliation"] });
    expect(whyItWaits(duplicate)).toEqual({ code: "duplicate", title: "Science Exhibition" });
    // Below the bar it is added, marked Checking (the owner, 2026-11-03); one still waiting only needs a look.
    expect(whyItWaits(evidence({ autonomy: "execute", autoAddPercent: 95 }))).toEqual({ code: "check" });
  });

  it("says money and health wait for a person, and who it's for when nobody is named", () => {
    expect(whyItWaits(evidence({ kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-10", confidence: "high", needs: [] } }))).toEqual({ code: "money" });
    expect(whyItWaits(evidence({ subject: { question: null, selected: null } as ConfirmationInput["subject"] }))).toEqual({ code: "who" });
    expect(whyItWaits(evidence({ memberInitiated: false }))).toEqual({ code: "by_email" });
  });
});

describe("the lifecycle, on the household's clock", () => {
  const now = new Date("2026-11-03T20:00:00Z"); // 4 Nov, 01:30 in Kolkata

  it("counts days on the household's own calendar", () => {
    expect(daysBetween(new Date("2026-10-20T18:00:00Z"), now, "Asia/Kolkata")).toBe(15);
    expect(daysBetween(new Date("2026-10-20T18:00:00Z"), now, "UTC")).toBe(14);
  });

  it("nudges at 14 days and archives at 30, only what is waiting or failed", () => {
    const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    expect(isStale(at(13), now, "UTC")).toBe(false);
    expect(isStale(at(14), now, "UTC")).toBe(true);
    expect(isDueForArchive({ status: "classified", lastTouched: at(29) }, now, "UTC")).toBe(false);
    expect(isDueForArchive({ status: "classified", lastTouched: at(30) }, now, "UTC")).toBe(true);
    expect(isDueForArchive({ status: "failed", lastTouched: at(45) }, now, "UTC")).toBe(true);
    for (const status of ["routed", "dismissed", "undone", "archived"] as const) expect(isDueForArchive({ status, lastTouched: at(90) }, now, "UTC")).toBe(false);
  });
});

describe("try again on a failed item", () => {
  const failed = { status: "failed" as const, failureReason: "link_unreachable" as const, source: "link", sourceUrl: "https://school.example/notice" };

  it("is offered where a second read can help, up to five tries", () => {
    expect(retryState(failed, { retryCount: 0, retryRequestedAt: null })).toEqual({ allowed: true, tries: 0 });
    expect(retryState(failed, { retryCount: RETRY_CAP - 1, retryRequestedAt: null }).allowed).toBe(true);
    expect(retryState(failed, { retryCount: RETRY_CAP, retryRequestedAt: null })).toEqual({ allowed: false, reason: "cap", tries: RETRY_CAP });
    expect(retryState(failed, { retryCount: 1, retryRequestedAt: "2026-11-03T10:00:00Z" }).reason).toBe("in_progress");
  });

  it("is never offered for what the safety check refused, or a private link", () => {
    expect(retryState({ ...failed, failureReason: "security_rejected" }, { retryCount: 0, retryRequestedAt: null }).allowed).toBe(false);
    expect(retryState({ ...failed, failureReason: "link_blocked" }, { retryCount: 0, retryRequestedAt: null }).allowed).toBe(false);
    expect(retryState({ ...failed, status: "classified" }, { retryCount: 0, retryRequestedAt: null }).allowed).toBe(false);
  });
});

describe("what the grouped reminder counts", () => {
  it("counts kinds, photos and failures, most consequential first", () => {
    const row = (status: string, kind: string | null, type: string | null = null) => ({ status, classified_kind: kind, content_type: type, updated_at: "2026-11-01T00:00:00Z" });
    expect(countWaiting([row("classified", "school_item"), row("classified", "activity_item"), row("classified", "bill"), row("classified", "unknown", "image/png"), row("failed", null)])).toEqual({
      total: 5,
      groups: [
        { group: "bill", count: 1 },
        { group: "school_item", count: 2 },
        { group: "photo", count: 1 },
        { group: "failed", count: 1 },
      ],
    });
  });
});
