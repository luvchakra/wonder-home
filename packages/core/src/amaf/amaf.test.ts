import { describe, expect, it } from "vitest";

import { AMAF_FACTS, clashesFor, factByKey, readAllergies, readDiet, readPets, readRelation, readSchool, type AmafPerson, type AmafSnapshot } from "./facts";
import { candidates, gapsLeft, nextQuestion } from "./plan";
import { provenanceOf, provenanceWords } from "./provenance";
import { amafStep, isAmafStart, isAmafUndo, type AmafPending } from "./session";

const KUNAL = "11111111-1111-1111-1111-111111111111";
const PRIYA = "22222222-2222-2222-2222-222222222222";
const ASMI = "33333333-3333-3333-3333-333333333333";
const RAMU = "44444444-4444-4444-4444-444444444444";

const person = (id: string, name: string, memberType: AmafPerson["memberType"], over: Partial<AmafSnapshot["people"][number]> = {}): AmafSnapshot["people"][number] => ({
  id,
  name,
  memberType,
  dateOfBirth: null,
  occupation: null,
  workArrangement: null,
  workHours: null,
  phone: null,
  specialOccasion: null,
  updatedAt: "2026-10-01T10:00:00Z",
  ...over,
});

const snapshot = (over: Partial<AmafSnapshot> = {}): AmafSnapshot => ({
  today: "2026-10-20",
  speaker: { memberId: KUNAL, isAdmin: true, memberType: "adult" },
  people: [person(KUNAL, "Kunal", "adult"), person(PRIYA, "Priya", "adult"), person(ASMI, "Asmi", "child"), person(RAMU, "Ramu", "helper")],
  relationships: [],
  enrolments: [],
  teachers: [],
  activities: [],
  familyDiet: null,
  foodPreferences: [],
  bills: [],
  responsibilities: [],
  address: null,
  pets: [],
  helperWindows: {},
  memoryKeys: [],
  answered: [],
  ...over,
});

const everyone: AmafPerson[] = [
  { id: KUNAL, name: "Kunal", memberType: "adult" },
  { id: PRIYA, name: "Priya Sharma", memberType: "adult" },
  { id: ASMI, name: "Asmi", memberType: "child" },
  { id: RAMU, name: "Ramu", memberType: "helper" },
];

const ask = (fact: string, subjectId: string | null, over: Partial<Extract<AmafPending, { step: "ask" }>> = {}): AmafPending => ({ step: "ask", fact, subjectId, refresh: false, slot: null, partial: {}, tries: 0, ...over });

describe("which question comes next", () => {
  it("asks about allergies first, then what reminders need, and never the same part of the app twice in a row", () => {
    const first = nextQuestion(snapshot());
    expect(first?.fact.key).toBe("household.allergies");
    const second = nextQuestion(snapshot(), { lastModule: "food" });
    expect(second?.fact.module).not.toBe("food");
    expect(second?.fact.key).toBe("member.birthday");
    // The speaker's own birthday comes before someone else's.
    expect(second?.subject.id).toBe(KUNAL);
  });

  it("asks an Admin about bills and the home, and an adult who is not an Admin only what they may change", () => {
    const admin = candidates(snapshot()).map((choice) => choice.fact.key);
    expect(admin).toContain("bill.electricity");
    expect(admin).toContain("household.address");
    const adult = candidates(snapshot({ speaker: { memberId: PRIYA, isAdmin: false, memberType: "adult" } }));
    expect(adult.map((choice) => choice.fact.key)).not.toContain("bill.electricity");
    // Not an Admin: someone else's birthday as an adult is theirs to give, a child's is fine.
    const birthdays = adult.filter((choice) => choice.fact.key === "member.birthday").map((choice) => choice.subject.id);
    expect(birthdays).toEqual(expect.arrayContaining([PRIYA, ASMI]));
    expect(birthdays).not.toContain(KUNAL);
  });

  it("never asks a child or a helper", () => {
    expect(candidates(snapshot({ speaker: { memberId: ASMI, isAdmin: false, memberType: "child" } }))).toEqual([]);
    expect(candidates(snapshot({ speaker: { memberId: RAMU, isAdmin: false, memberType: "helper" } }))).toEqual([]);
  });

  it("leaves a skipped question for two weeks and a 'none' for half a year", () => {
    const skipped = snapshot({ answered: [{ factKey: "household.allergies", subjectId: null, outcome: "skipped", at: "2026-10-15T09:00:00Z" }] });
    expect(nextQuestion(skipped)?.fact.key).not.toBe("household.allergies");
    const later = snapshot({ today: "2026-11-05", answered: [{ factKey: "household.allergies", subjectId: null, outcome: "skipped", at: "2026-10-15T09:00:00Z" }] });
    expect(nextQuestion(later)?.fact.key).toBe("household.allergies");
    const none = snapshot({ today: "2027-01-01", answered: [{ factKey: "household.pets", subjectId: null, outcome: "none", at: "2026-10-15T09:00:00Z" }] });
    expect(candidates(none).map((choice) => choice.fact.key)).not.toContain("household.pets");
  });

  it("checks a known school and grade again after six months, openly, and counts only gaps as left", () => {
    const enrolled = snapshot({ enrolments: [{ childId: ASMI, schoolName: "Delhi Public School", grade: "3", hours: null, updatedAt: "2026-03-01T00:00:00Z" }] });
    const school = candidates(enrolled).find((choice) => choice.fact.key === "child.school");
    expect(school?.refresh).toBe(true);
    const fresh = snapshot({ enrolments: [{ childId: ASMI, schoolName: "Delhi Public School", grade: "3", hours: null, updatedAt: "2026-09-01T00:00:00Z" }] });
    expect(candidates(fresh).find((choice) => choice.fact.key === "child.school")).toBeUndefined();
    expect(gapsLeft(enrolled)).toBe(candidates(enrolled).filter((choice) => !choice.refresh).length);
  });

  it("covers every part of the app", () => {
    expect(new Set(AMAF_FACTS.map((fact) => fact.module))).toEqual(new Set(["family", "school", "food", "bills", "duties", "home", "pets", "helpers", "brain"]));
  });
});

describe("reading an answer", () => {
  const base = snapshot();
  const step = (pending: AmafPending, answer: string, over: Partial<AmafSnapshot> = {}) => amafStep({ pending, answer, snapshot: { ...base, ...over }, people: everyone });

  it("saves a birthday, and asks for the year when it was left out", () => {
    expect(step(ask("member.birthday", ASMI), "14th Feb 2016")).toMatchObject({ kind: "write", outcome: "saved", value: { fact: "member.birthday", date: "2016-02-14" } });
    const partial = step(ask("member.birthday", ASMI), "14 February");
    expect(partial).toMatchObject({ kind: "follow_up", pending: { slot: "year", partial: { month: 2, day: 14 } } });
    if (partial.kind !== "follow_up") throw new Error("expected a follow-up");
    expect(step(partial.pending, "2016")).toMatchObject({ kind: "write", value: { date: "2016-02-14" } });
    expect(step(ask("member.birthday", ASMI), "3 May 2030")).toMatchObject({ kind: "retry" });
  });

  it("says when an answer disagrees with the record, and does not write over it", () => {
    const enrolled = { enrolments: [{ childId: ASMI, schoolName: "Delhi Public School", grade: "3", hours: null, updatedAt: "2026-03-01T00:00:00Z" }] };
    expect(step(ask("child.school", ASMI, { refresh: true }), "Delhi Public School, grade 4", enrolled)).toMatchObject({ kind: "conflict", value: { grade: "4" } });
    expect(step(ask("child.school", ASMI, { refresh: true }), "She's in class 3 at Delhi Public School", enrolled)).toMatchObject({ kind: "confirmed" });
    const confirm: AmafPending = { step: "confirm_change", fact: "child.school", subjectId: ASMI, value: { fact: "child.school", schoolName: "Delhi Public School", grade: "4" }, stored: "Delhi Public School, 3" };
    expect(step(confirm, "yes, change it", enrolled)).toMatchObject({ kind: "write", outcome: "changed", previous: { schoolName: "Delhi Public School", grade: "3" } });
    expect(step(confirm, "no, keep it", enrolled)).toMatchObject({ kind: "kept" });
  });

  it("never takes an allergy away because someone said 'nobody', and adds a new one to the rest", () => {
    const allergic = { foodPreferences: [{ id: "p1", memberId: ASMI, kind: "allergy", subject: "peanuts", updatedAt: "2025-01-01T00:00:00Z" }] };
    expect(step(ask("household.allergies", null, { refresh: true }), "no, nobody", allergic)).toMatchObject({ kind: "said_back" });
    expect(step(ask("household.allergies", null, { refresh: true }), "Priya is allergic to prawns", allergic)).toMatchObject({ kind: "write", outcome: "saved" });
  });

  it("reads 'nobody has a food allergy' as none, and a time is never an address", () => {
    expect(step(ask("household.allergies", null), "Nobody has a food allergy")).toMatchObject({ kind: "recorded", outcome: "none" });
    expect(step(ask("household.allergies", null), "No one except Priya, she is allergic to prawns")).toMatchObject({ kind: "write", value: { entries: [{ memberId: PRIYA, food: "prawns" }] } });
    expect(step(ask("household.address", null), "8 to 2:30")).toMatchObject({ kind: "retry" });
    expect(step(ask("household.address", null), "Flat 12, Green Park Society, Baner Road, Pune")).toMatchObject({ kind: "write", value: { fact: "household.address" } });
  });

  it("moves on, stops, keeps 'I don't know', and keeps unreadable words as a note on the second try", () => {
    expect(step(ask("member.birthday", ASMI), "skip")).toMatchObject({ kind: "recorded", outcome: "skipped" });
    expect(step(ask("member.birthday", ASMI), "that's enough for now")).toEqual({ kind: "stop" });
    expect(step(ask("member.birthday", ASMI), "I don't know")).toMatchObject({ kind: "recorded", outcome: "dont_know" });
    expect(step(ask("child.school_hours", ASMI), "it depends on the day")).toMatchObject({ kind: "retry" });
    expect(step(ask("child.school_hours", ASMI, { tries: 1 }), "it depends on the day")).toMatchObject({ kind: "write", outcome: "noted", value: { fact: "note" } });
  });

  it("reads work, hours and where", () => {
    expect(step(ask("member.work", PRIYA), "She's a software engineer, 9 to 6, mostly from home")).toMatchObject({
      kind: "write",
      value: { fact: "member.work", occupation: "software engineer", arrangement: "home", hours: { starts: "09:00", ends: "18:00" } },
    });
    expect(step(ask("member.work", PRIYA), "Doctor at Apollo")).toMatchObject({ kind: "follow_up", pending: { slot: "hours" } });
  });

  it("reads a bill with its payee, amount and day, and 'no' as none", () => {
    expect(step(ask("bill.electricity", "electricity"), "Yes, Tata Power, around 2,400, due on the 5th")).toMatchObject({
      kind: "write",
      value: { fact: "bill", billType: "electricity", payee: "Tata Power", amount: 2400, dueDay: 5 },
    });
    expect(step(ask("bill.rent", "rent"), "no, we own the house")).toMatchObject({ kind: "recorded", outcome: "none" });
    expect(step(ask("bill.broadband", "broadband"), "yes")).toMatchObject({ kind: "follow_up", pending: { slot: "details" } });
  });

  it("reads who has which allergy, by name", () => {
    expect(readAllergies("Asmi is allergic to peanuts and Priya to prawns", everyone, KUNAL).entries).toEqual([
      { memberId: ASMI, food: "peanuts" },
      { memberId: PRIYA, food: "prawns" },
    ]);
    expect(readAllergies("I'm allergic to kiwi", everyone, KUNAL).entries).toEqual([{ memberId: KUNAL, food: "kiwi" }]);
  });

  it("reads classes, pets, schools, diets and relations", () => {
    expect(step(ask("child.activity", ASMI), "She does piano on Tuesdays and Thursdays at 5 pm")).toMatchObject({
      kind: "write",
      value: { fact: "child.activity", name: "Piano", kind: "music", days: [2, 4], startsAt: "17:00" },
    });
    expect(step(ask("child.activity", ASMI), "Karate")).toMatchObject({ kind: "follow_up", pending: { slot: "when", partial: { name: "Karate", kind: "martial_arts" } } });
    expect(readPets("Yes, a dog called Bruno and a cat named Mishti")).toEqual([
      { name: "Bruno", species: "dog" },
      { name: "Mishti", species: "cat" },
    ]);
    expect(readSchool("She's in 4th at Bishop Cotton")).toEqual({ schoolName: "Bishop Cotton", grade: "4" });
    expect(readDiet("we're non veg")).toBe("non_vegetarian");
    expect(readDiet("pure veg")).toBe("vegetarian");
    expect(readDiet("vegetarian with eggs")).toBe("eggetarian");
    expect(readRelation("she's my mother-in-law")).toBe("mother_in_law");
    expect(readRelation("my daughter")).toBe("daughter");
  });

  it("says when an answer clashes with another record", () => {
    const likes = snapshot({ foodPreferences: [{ id: "like1", memberId: ASMI, kind: "preference", subject: "peanut butter", updatedAt: null }, { id: "like2", memberId: PRIYA, kind: "preference", subject: "chicken biryani", updatedAt: null }] });
    expect(clashesFor({ fact: "household.allergies", entries: [{ memberId: ASMI, food: "peanut" }] }, { kind: "household", id: null, name: null }, likes)).toMatchObject([{ kind: "allergy_vs_like", subject: "peanut butter" }]);
    expect(clashesFor({ fact: "household.diet", diet: "vegetarian" }, { kind: "household", id: null, name: null }, likes)).toMatchObject([{ kind: "diet_vs_like", subject: "chicken biryani" }]);
  });

  it("starts and undoes on the person's own words", () => {
    expect(isAmafStart("Ask me about my family")).toBe(true);
    expect(isAmafStart("AMAF")).toBe(true);
    expect(isAmafStart("ask me questions about our family")).toBe(true);
    expect(isAmafStart("Ask me about dinner")).toBe(false);
    expect(isAmafUndo("undo that")).toBe(true);
    expect(factByKey("member.birthday")?.module).toBe("family");
  });
});

describe("where a record came from", () => {
  const names = (id: string) => ({ [KUNAL]: "Kunal", [PRIYA]: "Priya" })[id] ?? null;
  it("takes the newest trail entry, and falls back to the record's own source", () => {
    expect(
      provenanceOf(
        {
          audit: [{ at: "2026-09-01T10:00:00Z", eventType: "member.profile_updated", byMemberId: KUNAL }],
          homesend: [{ at: "2026-09-10T10:00:00Z", byMemberId: PRIYA, undone: false }],
        },
        names,
        "Family",
      ),
    ).toEqual({ channel: "homesend", by: "Priya", at: "2026-09-10T10:00:00Z" });
    expect(provenanceOf({ audit: [{ at: "2026-09-01T10:00:00Z", eventType: "member.profile_updated", byMemberId: KUNAL }] }, names, "Family")).toEqual({ channel: "screen", by: "Kunal", at: "2026-09-01T10:00:00Z", screen: "Family" });
    expect(provenanceOf({ recordSource: "onboarding", recordUpdatedAt: "2026-08-01T00:00:00Z" }, names)).toEqual({ channel: "setup", by: null, at: "2026-08-01T00:00:00Z" });
    expect(provenanceWords({ channel: "screen", by: "Kunal", at: "2026-09-01T10:00:00Z", screen: "Family" }, () => "1 Sept")).toEqual({ key: "amaf.source.screenNamed.by.on", values: { name: "Kunal", date: "1 Sept", screen: "Family" } });
    expect(provenanceWords({ channel: "record", by: null, at: null }, () => "")).toEqual({ key: "amaf.source.record", values: {} });
  });
});
