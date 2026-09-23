import { describe, expect, it } from "vitest";

import type { Consumable } from "../commerce/consumables";
import type { FamilyEvent } from "../family/schedule";
import type { Obligation } from "../finance/payments";
import type { HealthAppointment } from "../health/appointments";
import type { HealthIssue } from "../health/issues";
import type { Pet } from "../home/pets";
import type { HouseholdMember } from "../identity/households";
import type { SchoolItem } from "../school/items";
import { buildContextItems, type ContextRecords, type MemoryRecord } from "./builders";
import { findPotentialConflicts } from "./conflicts";
import { applyFreshness } from "./freshness";
import { matchIncoming, needsReconciliation } from "./matching";
import { filterForViewer } from "./privacy";
import { resolvePerson, resolvePet, resolveReference } from "./resolution";
import { factsForQuestion } from "./retrieval";
import type { ContextScope, HouseholdContextItem } from "./types";

/**
 * The council's golden scenarios (Wave 1 §15), one `describe` each, against
 * one household: two children with dates of birth, parents recorded as
 * Father and Mother, a cook, a dog and a cat.
 */

const HOUSEHOLD = "hh-mehta";
const TZ = "Asia/Kolkata";
// Wed 23 Sep 2026, 11:30 in Kolkata.
const NOW = new Date("2026-09-23T06:00:00Z");

function member(id: string, displayName: string, memberType: HouseholdMember["memberType"], extra: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    id,
    displayName,
    memberType,
    status: "active",
    roles: [],
    isOwner: false,
    dateOfBirth: null,
    nickname: null,
    relationship: null,
    occupation: null,
    schoolOrWorkLocation: null,
    specialOccasionLabel: null,
    specialOccasionDate: null,
    gender: null,
    notes: null,
    avatarUrl: null,
    ...extra,
  };
}

const MEMBERS: HouseholdMember[] = [
  member("kunal", "Kunal Mehta", "adult", { roles: ["head"], relationship: "Father", dateOfBirth: "1985-02-11" }),
  member("upasana", "Upasana Mehta", "adult", { relationship: "Mother", dateOfBirth: "1987-06-03" }),
  member("asmi", "Asmi", "child", { relationship: "Daughter", dateOfBirth: "2015-04-10" }),
  member("manan", "Manan", "child", { relationship: "Son", dateOfBirth: "2018-08-02" }),
  member("sunita", "Sunita", "helper", { occupation: "Cook" }),
];

const PETS: Pet[] = [
  { id: "bruno", name: "Bruno", species: "Dog", active: true },
  { id: "misty", name: "Misty", species: "Cat", active: true },
];

function bill(id: string, name: string, extra: Partial<Obligation> = {}): Obligation {
  return { id, name, kind: "utility", payee: null, amountMinor: null, currency: "INR", dueOn: "2026-09-25", responsibleMemberId: "kunal", status: "received", requiresReview: false, ...extra };
}

function schoolItem(id: string, childMemberId: string, title: string, extra: Partial<SchoolItem> = {}): SchoolItem {
  return { id, childMemberId, kind: "project", title, subject: "Science", detail: null, dueAt: new Date("2026-09-26T04:30:00Z"), estimatedMinutes: null, estimateSource: null, status: "pending", completedAt: null, provider: null, externalId: null, ...extra };
}

function consumable(id: string, name: string, extra: Partial<Consumable> = {}): Consumable {
  return { id, name, category: "grocery", petId: null, unit: "litre", typicalQuantity: 1, daysPerUnit: 2, evidenceBasis: "member_stated", lastPurchasedOn: "2026-09-21", lastPurchasedQuantity: 2, ...extra };
}

function appointment(id: string, memberId: string, extra: Partial<HealthAppointment> = {}): HealthAppointment {
  return {
    id,
    householdId: HOUSEHOLD,
    memberId,
    appointmentType: "dentist",
    status: "confirmed",
    privacyScope: "private",
    startsAt: "2026-09-25T05:00:00Z",
    endsAt: null,
    provider: "Dr. Rao",
    facility: null,
    location: null,
    preparationNotes: null,
    notes: null,
    remindAdvance: true,
    remindPreparation: false,
    remindDayOf: true,
    calendarSync: false,
    familyEventId: null,
    rescheduledFromId: null,
    checkupId: null,
    createdByMemberId: memberId,
    createdAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    ...extra,
  };
}

function issue(id: string, memberId: string, privacyScope: HealthIssue["privacyScope"]): HealthIssue {
  return {
    id,
    householdId: HOUSEHOLD,
    memberId,
    label: "Migraine",
    description: null,
    status: "active",
    privacyScope,
    sourceType: "manual_entry",
    provenanceId: null,
    notes: null,
    startedAt: "2026-09-21T00:00:00Z",
    resolvedAt: null,
    createdByMemberId: memberId,
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
  };
}

function event(id: string, title: string, participants: string[], startsAt: string, extra: Partial<FamilyEvent> = {}): FamilyEvent {
  const start = new Date(startsAt);
  return {
    id,
    title,
    kind: "school_event",
    startsAt: start,
    endsAt: new Date(start.getTime() + 2 * 3_600_000),
    protected: false,
    ownerMemberId: null,
    status: "confirmed",
    actionState: null,
    actionDueAt: null,
    participants: participants.map((memberId) => ({ memberId, response: "yes" as const, required: true })),
    ...extra,
  };
}

function items(records: ContextRecords): HouseholdContextItem[] {
  return applyFreshness(
    buildContextItems({ members: MEMBERS, pets: PETS, ...records }, { householdId: HOUSEHOLD, householdName: "Mehta Home", timezone: TZ, now: NOW, viewerMemberId: "kunal" }),
    NOW,
  );
}

function scopeFor(memberId: string, extra: Partial<ContextScope["viewer"]> = {}): ContextScope {
  return {
    householdId: HOUSEHOLD,
    householdName: "Mehta Home",
    timezone: TZ,
    now: NOW,
    viewer: { memberId, permissions: ["finance.view", "school.manage", "health.manage"], tone: "adult", guardianOf: [], ...extra },
  };
}

const people = items({});
const reference = (text: string, list: HouseholdContextItem[], extra: Parameters<typeof resolveReference>[2] extends infer C ? Partial<C> : never = {}) =>
  resolveReference(text, list, { timezone: TZ, now: NOW, ...extra });

describe("1. Asmi vs Manan", () => {
  it("resolves each child by name, including a possessive", () => {
    expect(resolvePerson("Asmi", people, { viewerMemberId: "kunal" }).selected?.memberId).toBe("asmi");
    expect(resolvePerson("manan's", people, { viewerMemberId: "kunal" }).selected?.memberId).toBe("manan");
  });

  it("never confuses the two, and asks about a name that is only close", () => {
    const close = resolvePerson("Mannan", people, { viewerMemberId: "kunal" });
    expect(close.selected).toBeNull();
    expect(close.question).toBe("Did you mean Manan?");
  });
});

describe("2. Father vs Mother", () => {
  it("reads the family's own words for each parent", () => {
    expect(resolvePerson("Dad", people, { viewerMemberId: "asmi" }).selected?.memberId).toBe("kunal");
    expect(resolvePerson("papa", people, { viewerMemberId: "asmi" }).selected?.memberId).toBe("kunal");
    expect(resolvePerson("Mum", people, { viewerMemberId: "asmi" }).selected?.memberId).toBe("upasana");
    expect(resolvePerson("my mom", people, { viewerMemberId: "asmi" }).selected?.memberId).toBe("upasana");
  });

  it("reads 'my daughter', 'my son' and 'the older one' from what is recorded", () => {
    expect(resolvePerson("my daughter", people, { viewerMemberId: "kunal" }).selected?.memberId).toBe("asmi");
    expect(resolvePerson("my son", people, { viewerMemberId: "kunal" }).selected?.memberId).toBe("manan");
    expect(resolvePerson("the older one", people, { viewerMemberId: "kunal" }).selected?.memberId).toBe("asmi");
    expect(resolvePerson("the youngest", people, { viewerMemberId: "kunal" }).selected?.memberId).toBe("manan");
  });

  it("does not guess a child's relationship when none is recorded", () => {
    const unrecorded = applyFreshness(
      buildContextItems(
        { members: MEMBERS.map((entry) => (entry.memberType === "child" ? { ...entry, relationship: null } : entry)) },
        { householdId: HOUSEHOLD, householdName: "Mehta Home", timezone: TZ, now: NOW, viewerMemberId: "kunal" },
      ),
      NOW,
    );
    const resolution = resolvePerson("my daughter", unrecorded, { viewerMemberId: "kunal" });
    expect(resolution.selected).toBeNull();
    expect(resolution.ambiguous).toBe(true);
    expect(resolution.question).toContain("Asmi");
    expect(resolution.question).toContain("Manan");
  });
});

describe("3. 'that bill' with one bill on record", () => {
  it("is that bill", () => {
    const list = items({ obligations: [bill("b-elec", "Electricity", { payee: "BESCOM" })] });
    const resolution = reference("that bill", list);
    expect(resolution.selected?.entityId).toBe("b-elec");
    expect(resolution.candidates[0]!.reasons.join(" ")).toContain("the only bill");
  });
});

describe("4. 'that bill' with several on record", () => {
  it("asks which, naming each, rather than picking one", () => {
    const list = items({ obligations: [bill("b-elec", "Electricity", { payee: "BESCOM" }), bill("b-water", "Water", { payee: "BWSSB" })] });
    const resolution = reference("that bill", list);
    expect(resolution.selected).toBeNull();
    expect(resolution.ambiguous).toBe(true);
    expect(resolution.question).toMatch(/Which bill did you mean — .*Electricity.*or.*Water/);
  });

  it("never selects a consequential target it is not sure of", () => {
    const list = items({ obligations: [bill("b-elec", "Electricity"), bill("b-water", "Water")] });
    expect(reference("the electricity bill", list, { consequential: true }).selected?.entityId).toBe("b-elec");
    expect(reference("that bill", list, { consequential: true }).selected).toBeNull();
  });
});

describe("5. duplicate school item", () => {
  const list = items({ schoolItems: [schoolItem("s-sci", "asmi", "Science exhibition")] });

  it("recognises the same item arriving again", () => {
    const result = matchIncoming({ domain: "school", title: "Science exhibition", subjectMemberId: "asmi", date: "2026-09-26" }, list, { timezone: TZ });
    expect(result.verdict).toBe("exact_match");
    expect(result.item?.entityId).toBe("s-sci");
    expect(needsReconciliation(result)).toBe(true);
  });

  it("calls a longer name for the same thing a likely duplicate", () => {
    expect(matchIncoming({ domain: "school", title: "Science exhibition model", subjectMemberId: "asmi", date: "2026-09-26" }, list, { timezone: TZ }).verdict).toBe("likely_duplicate");
  });

  it("keeps another child's exhibition separate", () => {
    expect(matchIncoming({ domain: "school", title: "Science exhibition", subjectMemberId: "manan", date: "2026-09-26" }, list, { timezone: TZ }).verdict).toBe("related_but_different");
  });

  it("returns a reconciliation candidate for 'Asmi's science exhibition is Saturday' on the calendar too", () => {
    const calendar = items({ events: [event("e-sci", "Science exhibition", ["asmi"], "2026-09-26T04:30:00Z")] });
    const result = matchIncoming({ domain: "calendar", title: "science exhibition", subjectMemberId: "asmi", date: "2026-09-26" }, calendar, { timezone: TZ });
    expect(result.verdict).toBe("exact_match");
    expect(result.item?.entityId).toBe("e-sci");
  });
});

describe("6. similar grocery names", () => {
  const list = items({ consumables: [consumable("c-amul", "Amul Milk"), consumable("c-eggs", "Eggs", { unit: "dozen" })] });

  it("treats a shorter name for the same product as a likely duplicate", () => {
    expect(matchIncoming({ domain: "groceries", title: "milk" }, list, { timezone: TZ }).verdict).toBe("likely_duplicate");
  });

  it("keeps a different variety apart", () => {
    const almond = matchIncoming({ domain: "groceries", title: "almond milk" }, list, { timezone: TZ });
    expect(almond.verdict).toBe("related_but_different");
    expect(needsReconciliation(almond)).toBe(false);
  });

  it("forgives singular and plural", () => {
    expect(matchIncoming({ domain: "groceries", title: "egg" }, list, { timezone: TZ }).verdict).toBe("exact_match");
  });

  it("resolves 'the same milk' to the one on record", () => {
    expect(reference("the same milk", list).selected?.entityId).toBe("c-amul");
  });
});

describe("7. private health is not visible to an unauthorized member", () => {
  const list = items({ healthIssues: [issue("i-upasana", "upasana", "private"), issue("i-asmi", "asmi", "private"), issue("i-shared", "upasana", "household_operational")] });
  const visible = (scope: ContextScope) => filterForViewer(list, scope).items.filter((item) => item.domain === "health").map((item) => item.entityId);

  it("keeps a private note from the household's own head — no admin shortcut", () => {
    expect(visible(scopeFor("kunal"))).not.toContain("i-upasana");
    expect(filterForViewer(list, scopeFor("kunal")).withheld).toContainEqual({ id: "health_issue:i-upasana", reason: "health_scope" });
  });

  it("shows it to its own subject, and a child's to their guardian", () => {
    expect(visible(scopeFor("upasana"))).toContain("i-upasana");
    expect(visible(scopeFor("kunal", { guardianOf: ["asmi"] }))).toContain("i-asmi");
    expect(visible(scopeFor("kunal"))).not.toContain("i-asmi");
  });

  it("shows household-operational health to anyone allowed health at all, and nothing without health.manage", () => {
    expect(visible(scopeFor("kunal"))).toContain("i-shared");
    expect(visible(scopeFor("kunal", { permissions: ["finance.view"] }))).toEqual([]);
  });
});

describe("8. a private appointment does not leak household-wide", () => {
  const list = items({ healthAppointments: [appointment("a-upasana", "upasana")], events: [event("e-karate", "Karate", ["upasana"], "2026-09-25T05:30:00Z")] });

  it("never reaches another adult's facts, whatever they ask", () => {
    const { items: kept } = filterForViewer(list, scopeFor("kunal"));
    const text = factsForQuestion({ items: kept }, "what appointments does Upasana have on Friday?").map((fact) => fact.text).join("\n");
    expect(text).not.toContain("dentist");
    expect(text).not.toContain("Dr. Rao");
  });

  it("says only 'an appointment' when it clashes with something on the calendar", () => {
    const conflicts = findPotentialConflicts(list);
    const clash = conflicts.find((conflict) => conflict.kind === "schedule_overlap");
    expect(clash?.summary).toContain("an appointment");
    expect(clash?.summary).not.toContain("dentist");
  });
});

describe("9. a confirmed preference supersedes a learned one", () => {
  const memories: MemoryRecord[] = [
    { id: "m-confirmed", scope: "household", memberId: null, category: "preference", key: "meals.dinner", value: { statement: "dinner at 8" }, status: "confirmed", confidence: 1, sourceType: "setup", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" },
    { id: "m-learned", scope: "household", memberId: null, category: "preference", key: "meals.dinner", value: { statement: "dinner at 9" }, status: "learned", confidence: 0.7, sourceType: "observed", createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" },
  ];
  const list = items({ memories });

  it("keeps the confirmed word as current even though the observation is newer", () => {
    expect(list.find((item) => item.entityId === "m-confirmed")?.freshness).toBe("current");
    const learned = list.find((item) => item.entityId === "m-learned");
    expect(learned?.freshness).toBe("superseded");
    expect(learned?.supersededBy).toBe("memory:m-confirmed");
  });

  it("tells the model only the confirmed preference, and surfaces the disagreement for review", () => {
    const text = factsForQuestion({ items: list }, "when do we usually have dinner?").filter((fact) => fact.relevant).map((fact) => fact.text).join("\n");
    expect(text).toContain("dinner at 8");
    expect(text).not.toContain("dinner at 9");
    expect(findPotentialConflicts(list).some((conflict) => conflict.kind === "contradictory_facts")).toBe(true);
  });
});

describe("10. a newer event supersedes a stale one", () => {
  it("replaces a rescheduled appointment with the one that moved it", () => {
    const list = items({
      healthAppointments: [
        appointment("a-old", "kunal", { status: "rescheduled", startsAt: "2026-09-24T05:00:00Z", updatedAt: "2026-09-21T00:00:00Z" }),
        appointment("a-new", "kunal", { startsAt: "2026-09-26T05:00:00Z", rescheduledFromId: "a-old", updatedAt: "2026-09-22T00:00:00Z" }),
      ],
    });
    const old = list.find((item) => item.entityId === "a-old");
    expect(old?.freshness).toBe("superseded");
    expect(old?.supersededBy).toBe("health_appointment:a-new");
    expect(list.find((item) => item.entityId === "a-new")?.freshness).toBe("current");
    expect(reference("Saturday's appointment", list).selected?.entityId).toBe("a-new");
  });

  it("never lets older source content override a newer record", () => {
    const list = items({ healthAppointments: [appointment("a-current", "kunal", { startsAt: "2026-09-26T05:00:00Z", updatedAt: "2026-09-22T09:00:00Z" })] });
    const result = matchIncoming(
      { domain: "health", title: "dentist appointment", subjectMemberId: "kunal", date: "2026-09-24", capturedAt: "2026-09-19T00:00:00Z" },
      list,
      { timezone: TZ },
    );
    expect(result.verdict).toBe("contradiction");
    expect(result.reasons.join(" ")).toContain("so it stands");
  });
});

describe("11. pet aliases", () => {
  it("resolves a pet by name, possessive and the family's word for its species", () => {
    expect(resolvePet("Bruno", people).selected?.petId).toBe("bruno");
    expect(resolvePet("Bruno's", people).selected?.petId).toBe("bruno");
    expect(resolvePet("the doggy", people).selected?.petId).toBe("bruno");
    expect(resolvePet("our cat", people).selected?.petId).toBe("misty");
  });

  it("asks which pet when 'the pet' could be either", () => {
    const resolution = resolvePet("the pet", people);
    expect(resolution.ambiguous).toBe(true);
  });
});

describe("12. a helper is not a family member", () => {
  it("resolves 'the helper' and 'the cook' to the househelper, as a helper", () => {
    const helper = resolvePerson("the helper", people, { viewerMemberId: "kunal" }).selected;
    expect(helper).toMatchObject({ memberId: "sunita", kind: "helper" });
    expect(resolvePerson("the cook", people, { viewerMemberId: "kunal" }).selected?.memberId).toBe("sunita");
  });

  it("keeps family as family", () => {
    expect(resolvePerson("Kunal", people, { viewerMemberId: "kunal" }).selected).toMatchObject({ kind: "family", memberType: "adult" });
  });

  it("never turns 'the helper' into an adult when there is no helper", () => {
    const noHelper = people.filter((item) => item.entityId !== "sunita");
    const resolution = resolvePerson("the helper", noHelper, { viewerMemberId: "kunal" });
    expect(resolution.selected).toBeNull();
    expect(resolution.candidates).toEqual([]);
  });
});

describe("13. HomeSend input matching an existing record", () => {
  const list = items({ obligations: [bill("b-elec", "Electricity", { payee: "BESCOM", amountMinor: 184000, dueOn: "2026-09-25" })] });

  it("recognises a photo of a bill already on record", () => {
    const result = matchIncoming(
      { domain: "bills", title: "BESCOM electricity bill", amountMinor: 184000, date: "2026-09-25", attributes: { payee: "BESCOM" } },
      list,
      { timezone: TZ },
    );
    expect(["exact_match", "likely_duplicate"]).toContain(result.verdict);
    expect(result.item?.entityId).toBe("b-elec");
    expect(result.reasons).toContain("the same payee");
  });

  it("calls a different amount for the same bill a likely update, still for a person to confirm", () => {
    const result = matchIncoming({ domain: "bills", title: "Electricity", amountMinor: 190000, date: "2026-09-25", attributes: { payee: "BESCOM" } }, list, { timezone: TZ });
    expect(result.verdict).toBe("likely_update");
    expect(needsReconciliation(result)).toBe(true);
  });

  it("does not mistake next month's bill for this one", () => {
    expect(matchIncoming({ domain: "bills", title: "Electricity", date: "2026-10-25", attributes: { payee: "BESCOM" } }, list, { timezone: TZ }).verdict).toBe("related_but_different");
  });
});

describe("14. HomeTalk referring to the previous proposal", () => {
  const list = items({
    obligations: [bill("b-elec", "Electricity", { payee: "BESCOM" }), bill("b-water", "Water", { payee: "BWSSB" })],
    proposals: [{ id: "p-1", actionType: "make_payment", status: "proposed", summary: "Pay the electricity", outcomeKey: "electricity", parameters: {}, createdAt: "2026-09-23T05:55:00Z" }],
  });

  it("reads 'that bill' as the bill just proposed, even among several — and even for a payment", () => {
    const resolution = reference("that bill", list, { pending: { actionType: "make_payment", outcomeKey: "electricity" }, consequential: true });
    expect(resolution.selected?.entityId).toBe("b-elec");
    expect(resolution.candidates[0]!.reasons).toContain("the one just proposed");
  });

  it("reads 'do that' as the proposal waiting for a yes", () => {
    expect(reference("do that", list).selected?.entityType).toBe("proposal");
  });
});
