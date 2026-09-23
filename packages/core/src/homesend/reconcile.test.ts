import { describe, expect, it } from "vitest";

import { buildContextItems, type ContextRecords } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import { findPotentialMatches, needsReconciliation } from "../context/matching";
import type { IncomingFact } from "../context/types";
import type { Obligation } from "../finance/payments";
import type { HouseholdMember } from "../identity/households";
import type { SchoolItem } from "../school/items";
import { movedDueAt, proposalFor, shortDate, type HomeSendCandidate } from "./reconcile";
import { resolveIntakePeople } from "./resolve";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-23T06:00:00Z");

function member(id: string, displayName: string, memberType: HouseholdMember["memberType"]): HouseholdMember {
  return {
    id, displayName, memberType, status: "active", roles: [], isOwner: false, dateOfBirth: null, nickname: null, relationship: null,
    occupation: null, schoolOrWorkLocation: null, specialOccasionLabel: null, specialOccasionDate: null, gender: null, notes: null, avatarUrl: null,
  };
}

const MEMBERS = [member("kunal", "Kunal Mehta", "adult"), member("asmi", "Asmi", "child"), member("manan", "Manan", "child"), member("sunita", "Sunita", "helper")];
const NAMES = new Map(MEMBERS.map((m) => [m.id, m.displayName]));

function schoolItem(id: string, childMemberId: string, title: string, dueAt: string, extra: Partial<SchoolItem> = {}): SchoolItem {
  return { id, childMemberId, kind: "event", title, subject: "Science", detail: null, dueAt: new Date(dueAt), estimatedMinutes: null, estimateSource: null, status: "pending", completedAt: null, provider: null, externalId: null, ...extra };
}

function bill(id: string, name: string, extra: Partial<Obligation> = {}): Obligation {
  return { id, name, kind: "utility", payee: "City Power", amountMinor: 124050, currency: "INR", dueOn: "2026-10-05", responsibleMemberId: "kunal", status: "received", requiresReview: false, ...extra };
}

function items(records: ContextRecords) {
  return applyFreshness(buildContextItems(records, { householdId: "hh", householdName: "Mehta Home", timezone: TZ, now: NOW, viewerMemberId: "kunal" }), NOW);
}

function reconcile(records: ContextRecords, candidate: HomeSendCandidate) {
  const incoming: IncomingFact = {
    domain: candidate.kind === "bill" ? "bills" : "school",
    title: candidate.title,
    subjectMemberId: candidate.subjectMemberId ?? null,
    date: candidate.date ?? null,
    amountMinor: candidate.amount != null ? Math.round(candidate.amount * 100) : null,
    attributes: { payee: candidate.payee ?? undefined },
    capturedAt: candidate.capturedAt ?? null,
  };
  const matches = findPotentialMatches(incoming, items(records), { timezone: TZ });
  const best = matches.find(needsReconciliation) ?? (candidate.change === "cancellation" ? matches[0] : undefined);
  return best ? proposalFor(best, candidate, NAMES) : null;
}

describe("HomeSend reconciliation (Wave 3 §10)", () => {
  const exhibition = schoolItem("s-sci", "asmi", "Science Exhibition", "2026-09-28T04:30:00Z");

  it("proposes the spec's own update: the Science Exhibition moved from 28 to 29 Sep", () => {
    const found = reconcile({ schoolItems: [exhibition] }, { kind: "school_item", title: "Science Exhibition", date: "2026-09-29", subjectMemberId: "asmi", change: "update" });
    expect(found?.proposal).toEqual({ type: "update", changes: [{ field: "date", from: "2026-09-28", to: "2026-09-29" }] });
    expect(found?.existingId).toBe("s-sci");
    expect(found?.message).toBe("I found Asmi's existing Science Exhibition for 28 Sep. This message says it moved to 29 Sep. Update the existing event?");
  });

  it("calls an exact repeat a duplicate, not an update", () => {
    const found = reconcile({ schoolItems: [exhibition] }, { kind: "school_item", title: "Science Exhibition", date: "2026-09-28", subjectMemberId: "asmi" });
    expect(found?.proposal).toEqual({ type: "duplicate" });
  });

  it("proposes cancelling the existing record when the content says it is called off", () => {
    const found = reconcile({ schoolItems: [exhibition] }, { kind: "school_item", title: "Science Exhibition", subjectMemberId: "asmi", change: "cancellation" });
    expect(found?.proposal).toEqual({ type: "cancellation" });
    expect(found?.message).toMatch(/This message says it is cancelled\. Cancel the existing event\?$/);
  });

  it("calls the record by its own kind", () => {
    const exam = schoolItem("s-exam", "asmi", "Maths exam", "2026-09-28T04:30:00Z", { kind: "exam" });
    const found = reconcile({ schoolItems: [exam] }, { kind: "school_item", title: "Maths exam", date: "2026-09-30", subjectMemberId: "asmi", change: "update" });
    expect(found?.message).toMatch(/Update the existing exam\?$/);
  });

  it("never proposes cancelling a record that is already cancelled", () => {
    const found = reconcile({ schoolItems: [{ ...exhibition, status: "cancelled" }] }, { kind: "school_item", title: "Science Exhibition", subjectMemberId: "asmi", change: "cancellation" });
    expect(found?.proposal.type).not.toBe("cancellation");
  });

  it("does not touch the other child's similar record (two children with similar records)", () => {
    const records = { schoolItems: [exhibition, schoolItem("s-sci-m", "manan", "Science Exhibition", "2026-09-28T04:30:00Z")] };
    const found = reconcile(records, { kind: "school_item", title: "Science Exhibition", date: "2026-09-29", subjectMemberId: "manan", change: "update" });
    expect(found?.existingId).toBe("s-sci-m");
    expect(found?.message).toMatch(/^I found Manan's existing/);
  });

  it("proposes a revised bill amount and due date together", () => {
    const found = reconcile({ obligations: [bill("b-elec", "Electricity bill")] }, { kind: "bill", title: "Electricity bill", payee: "City Power", date: "2026-10-12", amount: 1310, change: "update" });
    expect(found?.proposal).toEqual({
      type: "update",
      changes: [
        { field: "date", from: "2026-10-05", to: "2026-10-12" },
        { field: "amount", from: 124050, to: 131000 },
      ],
    });
    expect(found?.message).toMatch(/it moved to 12 Oct and the amount is now 1310\.00\. Update the existing bill\?$/);
  });

  it("finds nothing for something genuinely new", () => {
    expect(reconcile({ schoolItems: [exhibition] }, { kind: "school_item", title: "Annual Day rehearsal", date: "2026-10-02", subjectMemberId: "asmi" })).toBeNull();
  });

  it("keeps the time of day when only the date moves", () => {
    // 10:00 in Kolkata on 28 Sep, moved to 29 Sep, is still 10:00 there.
    expect(movedDueAt("2026-09-28T04:30:00.000Z", "2026-09-29", TZ)).toBe("2026-09-29T04:30:00.000Z");
    expect(movedDueAt("2026-03-07T14:00:00.000Z", "2026-03-10", "America/New_York")).toBe("2026-03-10T13:00:00.000Z");
    expect(movedDueAt(null, "2026-09-29", TZ)).toBe("2026-09-29T00:00:00.000Z");
  });

  it("writes dates the way the spec does", () => {
    expect(shortDate("2026-09-29")).toBe("29 Sep");
    expect(shortDate("2026-01-05T10:00:00Z")).toBe("5 Jan");
    expect(shortDate(null)).toBeNull();
  });
});

describe("HomeSend entity resolution (Wave 3 §9)", () => {
  const people = items({ members: MEMBERS });
  const understanding = (kind: "school_item" | "health_document" | "bill", names: string[]) => ({
    kind,
    entities: [],
    references: names.map((text) => ({ text, candidates: [], confidence: 0 })),
  });

  it("resolves a named child to their member record", () => {
    const { subject, references } = resolveIntakePeople(understanding("school_item", ["Asmi"]), people, { viewerMemberId: "kunal" });
    expect(subject.selected).toEqual({ memberId: "asmi", displayName: "Asmi", memberType: "child" });
    expect(subject.question).toBeNull();
    expect(references[0]).toMatchObject({ text: "Asmi", candidates: ["Asmi"] });
    expect(references[0]?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("asks one question when no name is given and there are two children — never guesses", () => {
    const { subject } = resolveIntakePeople(understanding("school_item", []), people, { viewerMemberId: "kunal" });
    expect(subject.selected).toBeNull();
    expect(subject.question).toBe("Who is this for — Asmi or Manan?");
    expect(subject.candidates.map((person) => person.displayName)).toEqual(["Asmi", "Manan"]);
  });

  it("asks rather than guessing when a name fits two children", () => {
    const twins = items({ members: [...MEMBERS.slice(0, 1), member("a1", "Asha", "child"), member("a2", "Asha", "child")] });
    const { subject } = resolveIntakePeople(understanding("school_item", ["Asha"]), twins, { viewerMemberId: "kunal" });
    expect(subject.selected).toBeNull();
    expect(subject.question).toBe("Who is this for — Asha or Asha?");
  });

  it("never files a school item for an adult or a helper, however the name reads", () => {
    const { subject } = resolveIntakePeople(understanding("school_item", ["Sunita"]), people, { viewerMemberId: "kunal" });
    expect(subject.selected).toBeNull();
  });

  it("does not ask who a bill is for", () => {
    const { subject } = resolveIntakePeople(understanding("bill", ["Asmi"]), people, { viewerMemberId: "kunal" });
    expect(subject).toEqual({ said: null, selected: null, candidates: [], question: null });
  });

  it("selects the only child when nothing is named — the one person it can be for", () => {
    const one = items({ members: [MEMBERS[0]!, MEMBERS[1]!] });
    const { subject } = resolveIntakePeople(understanding("school_item", []), one, { viewerMemberId: "kunal" });
    expect(subject.selected?.displayName).toBe("Asmi");
  });
});
