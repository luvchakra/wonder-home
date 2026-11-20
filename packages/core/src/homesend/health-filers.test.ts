import { describe, expect, it } from "vitest";

import { resolveGaps } from "../homebrain/memory-resolve";
import type { HouseholdContextItem } from "../context/types";
import { endingFor } from "./deadlines";
import { asHealthFilers, gateHealthSubject, healthFiledFor, mayFileForOthers, namedHealthSubject, type HealthMember } from "./health-filers";
import type { SubjectResolution } from "./resolve";

const KUNAL = "00000000-0000-4000-8000-000000000001";
const UPASANA = "00000000-0000-4000-8000-000000000002";
const ASMI = "00000000-0000-4000-8000-000000000003";
const SUNITA = "00000000-0000-4000-8000-000000000004";

const MEMBERS: HealthMember[] = [
  { id: KUNAL, displayName: "Kunal Mehta", memberType: "adult" },
  { id: UPASANA, displayName: "Upasana Mehta", memberType: "adult" },
  { id: ASMI, displayName: "Asmi", memberType: "child" },
  { id: SUNITA, displayName: "Sunita", memberType: "helper" },
];

const adult = (memberId: string) => ({ memberId, memberType: "adult" });
const forUpasana: SubjectResolution = { said: "Upasana", selected: { memberId: UPASANA, displayName: "Upasana Mehta", memberType: "adult" }, candidates: [], question: null };

describe("Who may file health records for others (owner, 2026-11-20)", () => {
  it("reads only member ids from the stored rule, nobody by default", () => {
    expect(asHealthFilers(null)).toEqual([]);
    expect(asHealthFilers({ members: "everyone" })).toEqual([]);
    expect(asHealthFilers({ members: [KUNAL, KUNAL, "not-an-id", 7] })).toEqual([KUNAL]);
  });

  it("never lets a child file for others, even when stored on the list", () => {
    expect(mayFileForOthers([KUNAL, ASMI], adult(KUNAL))).toBe(true);
    expect(mayFileForOthers([KUNAL, ASMI], { memberId: ASMI, memberType: "child" })).toBe(false);
    expect(mayFileForOthers([], adult(KUNAL))).toBe(false);
    expect(mayFileForOthers([SUNITA], { memberId: SUNITA, memberType: "helper" })).toBe(true);
  });

  it("keeps the person a health document names for an allowed sender; asks for anyone else", () => {
    expect(gateHealthSubject("health_document", forUpasana, adult(KUNAL), true).selected?.memberId).toBe(UPASANA);
    const asked = gateHealthSubject("health_document", forUpasana, adult(KUNAL), false);
    expect(asked.selected).toBeNull();
    expect(asked.question).toBe("Who is this for?");
    // Today's rule stays: the sender's own, or an adult's child.
    expect(gateHealthSubject("health_document", { ...forUpasana, selected: { memberId: KUNAL, displayName: "Kunal Mehta", memberType: "adult" } }, adult(KUNAL), false).selected?.memberId).toBe(KUNAL);
    expect(gateHealthSubject("health_document", { ...forUpasana, selected: { memberId: ASMI, displayName: "Asmi", memberType: "child" } }, adult(KUNAL), false).selected?.memberId).toBe(ASMI);
    expect(gateHealthSubject("health_document", forUpasana, { memberId: ASMI, memberType: "child" }, false).selected).toBeNull();
    // Other kinds are untouched.
    expect(gateHealthSubject("bill", forUpasana, adult(KUNAL), false)).toBe(forUpasana);
  });

  it("finds the one member a document names; never a helper, an outsider or two people", () => {
    expect(namedHealthSubject(["Upasana"], MEMBERS)?.id).toBe(UPASANA);
    expect(namedHealthSubject(["upasana mehta"], MEMBERS)?.id).toBe(UPASANA);
    expect(namedHealthSubject(["Sunita"], MEMBERS)).toBeNull();
    expect(namedHealthSubject(["Ramesh Gupta"], MEMBERS)).toBeNull();
    expect(namedHealthSubject(["Upasana", "Asmi"], MEMBERS)).toBeNull();
    expect(namedHealthSubject(["Mehta"], MEMBERS)).toBeNull();
  });

  it("files a waiting document for the person it names only for an allowed sender, and the deadlines step never asks", () => {
    const base = { kind: "health_document" as const, filers: [KUNAL], members: MEMBERS };
    expect(healthFiledFor({ ...base, sender: adult(KUNAL), names: ["Upasana"] })).toBe(UPASANA);
    expect(healthFiledFor({ ...base, sender: adult(KUNAL), names: ["Kunal"] })).toBeNull();
    expect(healthFiledFor({ ...base, sender: adult(UPASANA), names: ["Kunal"] })).toBeNull();
    expect(healthFiledFor({ ...base, sender: adult(KUNAL), names: ["Ramesh Gupta"] })).toBeNull();

    const waiting = { status: "classified" as const, kind: "health_document" as const, readable: true, failureReason: null, rawText: "Blood test", retryCount: 0, retryRequestedAt: null, canReadAgain: true, senderMemberId: KUNAL, asked: new Set<string>(), minutesSinceTouched: 60, match: null, addable: true };
    expect(endingFor({ ...waiting, filedFor: UPASANA })).toEqual({ action: "file_for", memberId: UPASANA });
    expect(endingFor({ ...waiting, filedFor: null })).toEqual({ action: "ask_add" });
    // Matched on record: never filed for anyone; the same one again is set aside as already on record (2026-11-20: no question).
    expect(endingFor({ ...waiting, match: "duplicate", filedFor: UPASANA }).action).toBe("already_recorded");
  });

  it("lets HomeBrain fill a health document's person from its own words only for an allowed sender", () => {
    const items = MEMBERS.map((member) => ({ id: `ctx-${member.id}`, entityType: "member", entityId: member.id, aliases: [], subjectMemberIds: [], attributes: { displayName: member.displayName, memberType: member.memberType } })) as unknown as HouseholdContextItem[];
    const memory = { items, rules: [] };
    const input = { kind: "health_document" as const, fields: ["person"] as const, text: "Thyroid test results for Upasana" };
    expect(resolveGaps(input, memory).filled).toEqual([]);
    const filled = resolveGaps({ ...input, healthFiler: true }, memory).filled[0];
    expect(filled?.value.memberId).toBe(UPASANA);
    expect(filled?.basis).toBe("named_in_document");
    expect(resolveGaps({ ...input, text: "Report for Sunita", healthFiler: true }, memory).filled).toEqual([]);
    expect(resolveGaps({ ...input, text: "Reports for Upasana and Asmi", healthFiler: true }, memory).filled).toEqual([]);
  });
});
