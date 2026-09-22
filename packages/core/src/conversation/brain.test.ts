import { describe, expect, it } from "vitest";

import { minimiseContext, DEFAULT_DATA_USE } from "../ai/privacy";
import { factsFrom, humanKey, type BrainSnapshot } from "./brain";

/**
 * The HomeBrain's facts (product-direction v4 §5): what the model is
 * told about a home, and which consent class each thing carries.
 */
const now = new Date("2026-09-20T13:10:00Z");

// Every member fixture below carries these — nobody in this test needs the
// extended profile fields, so they are all unset.
const NO_PROFILE_DETAILS = {
  dateOfBirth: null,
  nickname: null,
  relationship: null,
  occupation: null,
  schoolOrWorkLocation: null,
  specialOccasionLabel: null,
  specialOccasionDate: null,
  avatarUrl: null,
} as const;

const snapshot: BrainSnapshot = {
  householdName: "Asmi Family",
  timezone: "Asia/Kolkata",
  now,
  viewer: { memberId: "kunal", roleLabel: "Admin", tone: "adult" },
  members: [
    { id: "kunal", displayName: "Kunal Chakrabarty", memberType: "adult", status: "active", roles: ["head"], isOwner: true, ...NO_PROFILE_DETAILS },
    { id: "upasana", displayName: "Upasana Chakrabarty", memberType: "adult", status: "active", roles: [], isOwner: false, ...NO_PROFILE_DETAILS },
    { id: "anaya", displayName: "Anaya", memberType: "child", status: "active", roles: [], isOwner: false, ...NO_PROFILE_DETAILS },
    { id: "sunita", displayName: "Sunita", memberType: "helper", status: "active", roles: [], isOwner: false, ...NO_PROFILE_DETAILS },
  ],
  responsibilities: [{ outcomeKey: "school.run", primaryMemberId: "upasana", backupMemberId: "kunal", aiMode: "approve", priority: 1 }],
  events: [
    {
      id: "e1",
      title: "Karate",
      kind: "school_event",
      startsAt: new Date("2026-09-21T13:00:00Z"),
      endsAt: new Date("2026-09-21T14:00:00Z"),
      protected: false,
      ownerMemberId: null,
      status: "confirmed",
      actionState: null,
      actionDueAt: null,
      participants: [{ memberId: "anaya", response: "yes", required: true }],
    },
  ],
  meals: [
    {
      id: "m1",
      name: "Paneer pulao",
      slot: "dinner",
      onDate: "2026-09-20",
      readyBy: new Date("2026-09-20T14:30:00Z"),
      cookMemberId: "sunita",
      status: "planned",
      readyAt: null,
      recipe: null,
      ingredients: [{ name: "paneer", consumableId: null, quantity: 1, unit: "pack", essential: true, status: "missing", substituteName: null }],
    },
  ],
  consumables: [
    { id: "c1", name: "Milk", category: "grocery", petId: null, unit: "litre", typicalQuantity: 1, daysPerUnit: 1, evidenceBasis: null, lastPurchasedOn: null, lastPurchasedQuantity: null },
  ],
  orders: [],
  obligations: [
    { id: "b1", name: "Electricity", kind: "utility", payee: "BESCOM", amountMinor: 184000, currency: "INR", dueOn: "2026-09-21", responsibleMemberId: "kunal", status: "received", requiresReview: false },
  ],
  schoolItems: [
    { id: "s1", childMemberId: "anaya", kind: "homework", title: "Fractions worksheet", subject: "Maths", detail: null, dueAt: new Date("2026-09-22T03:30:00Z"), estimatedMinutes: 30, estimateSource: "inferred", status: "pending", completedAt: null, provider: null, externalId: null },
  ],
  communications: [],
  memories: [{ scope: "household", memberId: null, category: "preference", key: "meals.dinner", value: { statement: "we prefer dinner at 8", time: "20:00" }, status: "learned" }],
  absences: [{ memberId: "sunita", onDate: "2026-09-22", available: false, reason: null }],
  healthAppointments: [
    {
      id: "ha1",
      householdId: "hh1",
      memberId: "kunal",
      appointmentType: "dentist",
      status: "confirmed",
      privacyScope: "private",
      startsAt: "2026-09-23T10:30:00Z",
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
      createdByMemberId: "kunal",
      createdAt: "2026-09-19T00:00:00Z",
      updatedAt: "2026-09-19T00:00:00Z",
    },
  ],
  healthIssues: [
    {
      id: "hi1",
      householdId: "hh1",
      memberId: "upasana",
      label: "Headache",
      description: null,
      status: "active",
      privacyScope: "private",
      sourceType: "manual_entry",
      provenanceId: null,
      notes: null,
      startedAt: "2026-09-19T00:00:00Z",
      resolvedAt: null,
      createdByMemberId: "upasana",
      createdAt: "2026-09-19T00:00:00Z",
      updatedAt: "2026-09-19T00:00:00Z",
    },
  ],
  healthCheckups: [
    {
      id: "hc1",
      householdId: "hh1",
      memberId: "kunal",
      label: "Annual physical",
      checkupType: "doctor",
      source: "user_defined",
      cadenceDays: 365,
      nextDueOn: "2026-09-01",
      lastCompletedOn: null,
      privacyScope: "private",
      status: "active",
      linkedAppointmentId: null,
      notes: null,
      createdByMemberId: "kunal",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  agenda: {
    needsYou: [{ subjectKey: "bill:b1", title: "Electricity", status: "at_risk", riskLevel: "medium", notable: true, reason: "due tomorrow", action: { action: "Pay" }, dueOn: "2026-09-21" }],
    handled: [{ key: "meals", title: "Meals", meta: "1 of 1 checked" }],
    checked: 14,
    unavailable: [],
  },
};

describe("the facts a household's brain holds", () => {
  const facts = factsFrom(snapshot);
  const text = facts.map((fact) => fact.text).join("\n");

  it("says who is in the household, and who is asking", () => {
    expect(text).toContain("Kunal Chakrabarty is an adult and an Admin (the person asking).");
    expect(text).toContain("Anaya is a child.");
    expect(text).toContain("Sunita is a househelper.");
  });

  it("covers every domain in the household's own words and dates", () => {
    expect(text).toContain("School run is looked after by Upasana Chakrabarty (backup: Kunal Chakrabarty); WonderHome may act once approved for it.");
    expect(text).toContain("Karate (school event) is on Mon 21 Sep at 6:30pm, with Anaya.");
    expect(text).toContain("Dinner on 2026-09-20 is Paneer pulao, ready by 8:00pm, cooked by Sunita; status planned; missing paneer.");
    expect(text).toContain("Milk (grocery): typically 1 litre lasts about 1 day. No purchase has been recorded yet, so when it runs out is unknown.");
    expect(text).toContain("Electricity (utility, BESCOM) is received, ₹1,840, due 2026-09-21, Kunal Chakrabarty's to handle.");
    expect(text).toContain("Anaya has homework: Fractions worksheet (Maths), due Tue 22 Sep, pending, about 30 minutes.");
    expect(text).toContain("Sunita is away on 2026-09-22.");
    expect(text).toContain("Meals dinner — we prefer dinner at 8 (20:00).");
    expect(text).toContain("Needs attention: Electricity — due tomorrow (due 2026-09-21); suggested: Pay.");
    expect(text).toContain("WonderHome checked 14 things across meals and 1 need someone.");
    expect(text).toContain("Kunal Chakrabarty has a dentist appointment on Wed 23 Sep at 4:00pm with Dr. Rao, confirmed.");
    expect(text).toContain("Upasana Chakrabarty has an open health note: Headache (active), since Sat 19 Sep.");
    expect(text).toContain("Kunal Chakrabarty's Annual physical is overdue (2026-09-01).");
  });

  it("labels each fact with the class the consent gate decides on", () => {
    const classOf = (needle: string) => facts.find((fact) => fact.text.includes(needle))?.contentClass;
    expect(classOf("Anaya is a child")).toBe("child");
    expect(classOf("Fractions worksheet")).toBe("child");
    expect(classOf("Karate")).toBe("child");
    expect(classOf("Electricity (utility")).toBe("financial");
    expect(classOf("Sunita is away")).toBe("location");
    expect(classOf("Milk (grocery)")).toBe("general");
    expect(classOf("Sunita is a househelper")).toBe("general");
    expect(classOf("dentist appointment")).toBe("health");
    expect(classOf("open health note")).toBe("health");
    expect(classOf("Annual physical")).toBe("health");
  });

  it("is held back by the default consent to ordinary household matters only", () => {
    const people = snapshot.members.map((member) => ({ id: member.id, displayName: member.displayName, memberType: member.memberType }));
    const minimised = minimiseContext(facts, { policy: DEFAULT_DATA_USE, people });
    const sent = minimised.included.map((entry) => entry.text).join("\n");
    expect(sent).not.toContain("Fractions worksheet");
    expect(sent).not.toContain("Electricity (utility");
    expect(sent).not.toContain("is away on");
    expect(sent).not.toContain("dentist appointment");
    expect(sent).not.toContain("open health note");
    expect(sent).toContain("Milk (grocery): typically 1 litre lasts about 1 day.");
    // Names never leave, whatever the class.
    expect(sent).not.toContain("Kunal");
    expect(sent).toContain("Adult");
  });

  it("says what is empty rather than nothing", () => {
    const empty = factsFrom({ ...snapshot, responsibilities: [], events: [], meals: [], consumables: [], obligations: [], memories: [], absences: [], schoolItems: [], agenda: { needsYou: [], handled: [], checked: 0, unavailable: ["Bills"] } });
    const lines = empty.map((fact) => fact.text).join("\n");
    expect(lines).toContain("No responsibilities have been assigned yet.");
    expect(lines).toContain("Nothing is on the family calendar for the next 7 days.");
    expect(lines).toContain("No meals are planned from today onwards.");
    expect(lines).toContain("No groceries or supplies are tracked yet.");
    expect(lines).toContain("No bills are on record yet.");
    expect(lines).toContain("Bills could not be read just now.");
  });
});

describe("keys as words", () => {
  it("turns a dotted key into a phrase", () => {
    expect(humanKey("school.run")).toBe("School run");
    expect(humanKey("kids.bedtime")).toBe("Kids bedtime");
  });
});
