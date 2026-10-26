import { describe, expect, it } from "vitest";

import type { AnswerInput } from "../ai/model-client";
import { CONTENT_CLASSES, DEFAULT_DATA_USE, type DataUsePolicy } from "../ai/privacy";
import type { Consumable } from "../commerce/consumables";
import { buildContextItems, type ContextRecords } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import { filterForViewer } from "../context/privacy";
import { attachHomeSendEvidence } from "../context/provenance";
import type { ContextScope, HouseholdContextItem } from "../context/types";
import type { FamilyEvent } from "../family/schedule";
import type { Obligation } from "../finance/payments";
import type { HealthAppointment } from "../health/appointments";
import type { HomeSendChange, HomeSendItem } from "../homesend/items";
import type { HouseholdMember } from "../identity/households";
import type { Meal } from "../meals/meals";
import type { SchoolCommunication } from "../school/communications";
import type { SchoolItem } from "../school/items";
import { composeFromFacts, composeGrounded, modeFor, unknownAnswer, type ModelDraft } from "./answer";
import { buildHouseholdGraph } from "./graph";
import { householdInsights } from "./insights";
import { gateCandidates, groundFacts, relevantFacts, type GroundedFact } from "./grounding";
import { readBrainQuestion } from "./question";
import { answerWithHomeBrain, type HomeBrainTurn } from "./turn";
import { validateAnswer } from "./validate";
import { explain, readWhyQuestion, type RecordedAction } from "./why";

/**
 * HomeBrain 2.0's evaluation questions (Wave 2 §16), against one household:
 * the Mehtas — Kunal and Upasana, Asmi (11) and Manan (8), Sunita the cook.
 *
 * Each question checks the part of the pipeline that decides it without a
 * model: what the question is read as, which facts are chosen (and which are
 * kept out), the deterministic answer, the "why?" answer, and what the
 * validator refuses. A model can only ever be given what these tests show
 * is chosen, and only ever say what the validator lets through.
 */

const HOUSEHOLD = "hh-mehta";
const TZ = "Asia/Kolkata";
// Wed 23 Sep 2026, 11:30 in Kolkata.
const NOW = new Date("2026-09-23T06:00:00Z");
const TODAY = "2026-09-23";

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

function schoolItem(id: string, childMemberId: string, title: string, subject: string, dueAt: string): SchoolItem {
  return { id, childMemberId, kind: "homework", title, subject, detail: null, dueAt: new Date(dueAt), dueTimeKnown: !dueAt.includes("T00:00:00"), endsAt: null, estimatedMinutes: null, estimateSource: null, status: "pending", completedAt: null, provider: null, externalId: null };
}

function consumable(id: string, name: string, extra: Partial<Consumable> = {}): Consumable {
  return { id, name, category: "grocery", petId: null, unit: "packet", typicalQuantity: 1, daysPerUnit: 7, evidenceBasis: "member_stated", lastPurchasedOn: "2026-09-20", lastPurchasedQuantity: 1, ...extra };
}

function bill(id: string, name: string, dueOn: string, amountMinor: number): Obligation {
  return { id, name, kind: "utility", payee: null, amountMinor, currency: "INR", dueOn, responsibleMemberId: "kunal", status: "received", requiresReview: false };
}

function appointment(id: string, memberId: string, startsAt: string, extra: Partial<HealthAppointment> = {}): HealthAppointment {
  return {
    id,
    householdId: HOUSEHOLD,
    memberId,
    appointmentType: "dentist",
    status: "confirmed",
    privacyScope: "private",
    startsAt,
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

const DINNER: Meal = {
  id: "meal-dinner",
  name: "Pasta arrabbiata",
  slot: "dinner",
  onDate: TODAY,
  readyBy: new Date("2026-09-23T14:30:00Z"),
  cookMemberId: "sunita",
  status: "planned",
  readyAt: null,
  recipe: null,
  ingredients: [
    { name: "Pasta", consumableId: "c-pasta", quantity: 1, unit: "packet", essential: true, status: "missing" },
    { name: "Tomatoes", consumableId: "c-tomato", quantity: 4, unit: "piece", essential: true, status: "have" },
  ],
};

const SENT: HomeSendItem = {
  id: "hs-1",
  householdId: HOUSEHOLD,
  createdByMemberId: "kunal",
  source: "manual_upload",
  filePath: null,
  rawText: null,
  status: "routed",
  classifiedKind: "bill",
  extracted: { title: "Electricity", notes: null, billKind: "utility", payee: null, amount: 2400, currency: "INR", dueDate: "2026-09-25", schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, subjectMemberName: null, secondary: null },
  routedTable: "obligations",
  routedId: "b-electricity",
  securityStatus: "clean",
  externalId: null,
  senderAddress: null,
  createdAt: "2026-09-22T15:00:00Z",
} as HomeSendItem;

const CHANGES: HomeSendChange[] = [
  { id: "chg-1", householdId: HOUSEHOLD, intakeId: "hs-1", domain: "bill", entityId: "b-electricity", createdByMemberId: "kunal", createdAt: "2026-09-22T15:01:00Z", undoneAt: null, undoneByMemberId: null, changeType: "created", previous: null },
];

const SPORTS_NOTE: SchoolCommunication = {
  id: "note-sports",
  childMemberId: "asmi",
  receivedAt: new Date("2026-09-21T08:00:00Z"),
  subject: "Sports Day",
  summary: "Sports Day on Saturday; children wear white canvas shoes.",
  requiresAction: true,
  actionLabel: "Send white canvas shoes",
  actionDueAt: new Date("2026-09-26T03:00:00Z"),
};

const RECORDS: ContextRecords = {
  members: MEMBERS,
  pets: [],
  responsibilities: [
    { outcomeKey: "groceries.stocked", primaryMemberId: "kunal", backupMemberId: "upasana", aiMode: "prepare", priority: 1 },
    { outcomeKey: "bills.paid", primaryMemberId: "kunal", backupMemberId: null, aiMode: "prepare", priority: 2 },
    { outcomeKey: "school.run", primaryMemberId: "upasana", backupMemberId: null, aiMode: "prepare", priority: 3 },
  ],
  events: [
    event("e-sports", "Sports Day", ["asmi"], "2026-09-26T03:30:00Z"),
    event("e-karate", "Karate", ["manan"], "2026-09-24T11:30:00Z", { kind: "outing" }),
    event("e-dinner", "Family dinner", ["kunal", "upasana", "asmi", "manan"], "2026-09-27T13:30:00Z", { kind: "family_time", protected: true }),
    event("e-standup", "Office review", ["kunal"], "2026-09-25T05:00:00Z", { kind: "gathering" }),
  ],
  schoolItems: [
    schoolItem("s-asmi", "asmi", "Science project", "Science", "2026-09-24T04:30:00Z"),
    schoolItem("s-manan", "manan", "Maths worksheet", "Maths", "2026-09-24T04:30:00Z"),
  ],
  communications: [SPORTS_NOTE],
  consumables: [
    consumable("c-pasta", "Pasta", { lastPurchasedOn: "2026-09-01", daysPerUnit: 14 }),
    consumable("c-milk", "Milk", { unit: "litre", daysPerUnit: 1, lastPurchasedOn: "2026-09-21", lastPurchasedQuantity: 2 }),
    consumable("c-rice", "Rice", { unit: "kg", daysPerUnit: 30, lastPurchasedOn: "2026-09-18", lastPurchasedQuantity: 5 }),
  ],
  meals: [DINNER],
  obligations: [bill("b-electricity", "Electricity", "2026-09-25", 240000), bill("b-internet", "Internet", "2026-10-10", 99900)],
  healthAppointments: [
    appointment("h-kunal", "kunal", "2026-09-25T05:30:00Z"),
    appointment("h-upasana", "upasana", "2026-09-25T09:00:00Z"),
  ],
  homeSendItems: [SENT],
};

function itemsFor(viewer: Partial<ContextScope["viewer"]> & { memberId: string }, records: ContextRecords = RECORDS): HouseholdContextItem[] {
  const built = applyFreshness(
    attachHomeSendEvidence(buildContextItems(records, { householdId: HOUSEHOLD, householdName: "Mehta Home", timezone: TZ, now: NOW, viewerMemberId: viewer.memberId }), CHANGES),
    NOW,
  );
  const scope: ContextScope = {
    householdId: HOUSEHOLD,
    householdName: "Mehta Home",
    timezone: TZ,
    now: NOW,
    viewer: { permissions: ["finance.view", "school.manage", "health.manage"], tone: "adult", guardianOf: [], ...viewer },
  };
  return filterForViewer(built, scope).items;
}

const KUNAL = itemsFor({ memberId: "kunal" });

function ask(question: string, options: { items?: HouseholdContextItem[]; viewer?: string; previous?: string } = {}) {
  const items = options.items ?? KUNAL;
  const reading = readBrainQuestion(question, items, { viewerMemberId: options.viewer ?? "kunal", timezone: TZ, now: NOW, previousQuestion: options.previous ?? null });
  const facts = groundFacts(items, reading, { timezone: TZ, today: TODAY });
  return { reading, facts, relevant: relevantFacts(facts), text: relevantFacts(facts).map((fact) => fact.statement).join("\n") };
}

const has = (facts: GroundedFact[], fragment: string) => facts.some((fact) => fact.statement.includes(fragment));

describe("What do we need today?", () => {
  const { reading, relevant } = ask("What do we need today?");

  it("reaches across groceries, meals and school rather than one list", () => {
    expect(reading.time?.from).toBe(TODAY);
    expect(reading.domains.has("groceries") || reading.connected.has("groceries")).toBe(true);
    expect(has(relevant, "Pasta")).toBe(true);
    expect(has(relevant, "Pasta arrabbiata")).toBe(true);
  });

  it("composes a deterministic answer from what is on record today", () => {
    const answer = composeFromFacts(relevant, reading);
    expect(answer).toContain("Pasta arrabbiata");
    expect(answer).not.toContain("Internet");
  });
});

describe("What does Asmi have tomorrow? / What does Manan have tomorrow?", () => {
  it("keeps each child's day to that child", () => {
    const asmi = ask("What does Asmi have tomorrow?");
    expect(asmi.reading.people.map((person) => person.memberId)).toEqual(["asmi"]);
    expect(asmi.reading.time).toMatchObject({ from: "2026-09-24", to: "2026-09-24" });
    expect(asmi.text).toContain("Science project");
    expect(asmi.text).not.toContain("Maths worksheet");
    expect(asmi.text).not.toContain("Karate");

    const manan = ask("What does Manan have tomorrow?");
    expect(manan.text).toContain("Maths worksheet");
    expect(manan.text).toContain("Karate");
    expect(manan.text).not.toContain("Science project");
  });

  it("answers deterministically with only that child's tomorrow", () => {
    const { reading, relevant } = ask("What does Manan have tomorrow?");
    const answer = composeFromFacts(relevant, reading)!;
    expect(answer).toMatch(/^Here is what is on record for Manan tomorrow:/);
    expect(answer).toContain("Karate");
    expect(answer).not.toContain("Sports Day");
  });

  it("carries a follow-up: 'And Manan?' keeps the day and swaps the child", () => {
    const { reading, text } = ask("And Manan?", { previous: "What does Asmi have tomorrow?" });
    expect(reading.followUp).toBe(true);
    expect(reading.people.map((person) => person.memberId)).toEqual(["manan"]);
    expect(reading.time?.from).toBe("2026-09-24");
    expect(text).toContain("Karate");
    expect(text).not.toContain("Science project");
  });

  it("asks which child when 'the kid' could be either — a focused question, not a guess", () => {
    const { reading } = ask("What does the kid have tomorrow?");
    expect(reading.clarification).toMatch(/Asmi/);
    expect(reading.clarification).toMatch(/Manan/);
  });

  it("reads a bare name as the answer to its own question", () => {
    const { reading, text } = ask("Asmi", { previous: "What does the kid have tomorrow?" });
    expect(reading.clarification).toBeNull();
    expect(reading.followUp).toBe(true);
    expect(reading.people.map((person) => person.memberId)).toEqual(["asmi"]);
    expect(reading.time?.from).toBe("2026-09-24");
    expect(text).toContain("Science project");
  });

  it("resolves 'the older one' from dates of birth instead of asking", () => {
    const { reading } = ask("What does the older one have tomorrow?");
    expect(reading.clarification).toBeNull();
    expect(reading.people.map((person) => person.memberId)).toContain("asmi");
  });
});

describe("What does Asmi need for Saturday? (school → household need)", () => {
  const { reading, text } = ask("What does Asmi need for Saturday?");

  it("combines the calendar, the school's ask and what is in the house", () => {
    expect(reading.time).toMatchObject({ from: "2026-09-26", to: "2026-09-26" });
    expect(reading.connected.has("groceries") || reading.domains.has("groceries")).toBe(true);
    expect(text).toContain("Sports Day");
    expect(text).toContain("white canvas shoes");
  });
});

describe("Which bills are due this week?", () => {
  const { reading, relevant } = ask("Which bills are due this week?");

  it("puts this week's bill first and leaves next month's out of the answer", () => {
    expect(reading.time).toMatchObject({ from: TODAY, to: "2026-09-29" });
    const bills = relevant.filter((fact) => fact.domain === "bills");
    expect(bills[0]?.statement).toContain("Electricity");
    const answer = composeFromFacts(relevant, reading)!;
    expect(answer).toContain("Electricity");
    expect(answer).not.toContain("Internet");
  });

  it("never reaches a member without finance.view", () => {
    const child = itemsFor({ memberId: "asmi", permissions: [], tone: "child" });
    expect(ask("Which bills are due this week?", { items: child, viewer: "asmi" }).text).not.toContain("Electricity");
  });
});

describe("What's on my grocery list? (Alexa: \"ask WonderHome what's on my grocery list\")", () => {
  it("reads the groceries, the same as the app does", () => {
    const { reading, relevant } = ask("What's on my grocery list?");
    expect(reading.domains.has("groceries")).toBe(true);
    expect(has(relevant, "Milk")).toBe(true);
  });
});

describe("What groceries are running low?", () => {
  it("reads the groceries, not the whole home", () => {
    const { reading, relevant } = ask("What groceries are running low?");
    expect(reading.domains.has("groceries")).toBe(true);
    expect(has(relevant, "Milk")).toBe(true);
    expect(has(relevant, "Pasta")).toBe(true);
  });
});

describe("Can we make tonight's planned dinner? (meals → groceries)", () => {
  const { reading, relevant } = ask("Can we make tonight's planned dinner?");

  it("connects the plan to the groceries it needs", () => {
    expect(reading.domains.has("meals")).toBe(true);
    expect(reading.connected.has("groceries")).toBe(true);
    const dinner = relevant.find((fact) => fact.statement.includes("Pasta arrabbiata"));
    expect(dinner?.statement).toContain("missing Pasta");
    expect(relevant.some((fact) => fact.domain === "groceries" && fact.statement.startsWith("Pasta"))).toBe(true);
  });
});

describe("What changed since yesterday?", () => {
  it("is answered from what carries a time, with no model", () => {
    const why = readWhyQuestion("What changed since yesterday?");
    expect(why?.topic).toBe("recent_changes");
    const answer = explain({ ...why!, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: null, lastAction: null, clarifying: null });
    expect(answer.text).toMatch(/^Since yesterday:/);
    expect(answer.text).toContain("HomeSend");
  });
});

describe("Why are you asking for approval?", () => {
  const action: RecordedAction = {
    summary: "Pay the Electricity bill",
    actionType: "pay_bill",
    status: "proposed",
    kind: "needs_approval",
    because: "Payments always needs a person, whatever the autonomy setting.",
    failure: null,
  };

  it("cites the recorded reason, never reasoning", () => {
    const why = readWhyQuestion("Why are you asking for approval?")!;
    expect(why.topic).toBe("why_approval");
    const answer = explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: null, lastAction: action, clarifying: null });
    expect(answer.text).toContain("Pay the Electricity bill");
    expect(answer.text).toContain("payments always needs a person");
    expect(answer.text).toContain("Nothing happens until someone says yes");
  });

  it("says so when nothing is waiting", () => {
    const why = readWhyQuestion("why do you need my approval")!;
    expect(explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: null, lastAction: null, clarifying: null }).text).toBe("Nothing is waiting for your approval right now.");
  });

  it("explains a question it asked from the question and what prompted it", () => {
    const why = readWhyQuestion("Why are you asking me this?")!;
    expect(why.topic).toBe("why_question");
    const answer = explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: "Which items should I add?", lastAction: null, clarifying: { question: "Which items should I add?", utterance: "add stuff", action: "add_to_list" } });
    expect(answer.text).toContain('"add stuff"');
  });

  it("explains what did not happen from what was recorded", () => {
    const why = readWhyQuestion("Why didn't you add that?")!;
    expect(why.topic).toBe("why_not_done");
    const failed = explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: null, lastAction: { ...action, status: "failed", failure: "the list was archived" }, clarifying: null });
    expect(failed.text).toContain("did not go through: the list was archived.");
  });
});

describe("Where did this date come from? / Why do you think this is for Asmi?", () => {
  it("names the record and the HomeSend intake behind it", () => {
    const why = readWhyQuestion("Where did this date come from?")!;
    expect(why).toEqual({ topic: "source", subject: "date" });
    const answer = explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: "The Electricity bill is due 2026-09-25.", lastAction: null, clarifying: null });
    expect(answer.text).toContain("Electricity");
    expect(answer.text).toContain("Added from something sent to HomeSend on Tue 22 Sep");
    expect(answer.evidenceIds).toContain("bill:b-electricity");
  });

  it("points at the record that names the person", () => {
    const why = readWhyQuestion("Why do you think this is for Asmi?")!;
    expect(why).toEqual({ topic: "why_person", subject: "asmi" });
    const answer = explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: "The Science project is due tomorrow.", lastAction: null, clarifying: null });
    expect(answer.text).toContain("Science project");
    expect(answer.text).toContain("It is recorded for Asmi.");
  });

  it("admits when there is no record behind what was said", () => {
    const why = readWhyQuestion("how do you know that")!;
    const answer = explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: "Sounds lovely.", lastAction: null, clarifying: null });
    expect(answer.text).toMatch(/^I cannot point to a record/);
  });
});

describe("What did I just send you? / What did WonderHome change after I sent it?", () => {
  it("describes the last intake by this member", () => {
    const why = readWhyQuestion("What did I just send you?")!;
    expect(why.topic).toBe("sent");
    expect(explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: null, lastAction: null, clarifying: null }).text).toContain("was read as bill: Electricity, and added");
  });

  it("lists the record the intake became", () => {
    const why = readWhyQuestion("What did WonderHome change after I sent it?")!;
    expect(why.topic).toBe("changed_after_send");
    const answer = explain({ ...why, items: KUNAL, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: null, lastAction: null, clarifying: null });
    expect(answer.text).toMatch(/^After you sent it on Tue 22 Sep, WonderHome added:/);
    expect(answer.text).toContain("Electricity (utility)");
  });

  it("never reports someone else's intake as theirs", () => {
    const why = readWhyQuestion("what did I just send")!;
    expect(explain({ ...why, items: itemsFor({ memberId: "upasana" }), viewerMemberId: "upasana", timezone: TZ, now: NOW, lastAssistantText: null, lastAction: null, clarifying: null }).text).toBe("I do not see anything you have sent to HomeSend yet.");
  });
});

describe("What responsibilities belong to me?", () => {
  it("reads 'me' as the person asking and finds what they own", () => {
    const { reading, relevant } = ask("What responsibilities belong to me?");
    expect(reading.domains.has("responsibilities")).toBe(true);
    expect(reading.people.map((person) => person.memberId)).toContain("kunal");
    expect(has(relevant, "Groceries stocked is looked after by Kunal Mehta")).toBe(true);
    expect(has(relevant, "Bills paid is looked after by Kunal Mehta")).toBe(true);
  });
});

describe("Which family events are protected?", () => {
  it("finds protected family time", () => {
    const { relevant } = ask("Which family events are protected?");
    expect(relevant.find((fact) => fact.statement.includes("Family dinner"))?.statement).toContain("protected family time");
  });
});

describe("What health appointments do I have? (authorized vs unauthorized)", () => {
  it("shows an authorized member their own appointment, and never someone else's private one", () => {
    const { text } = ask("What health appointments do I have?");
    expect(text).toContain("dentist");
    expect(KUNAL.some((item) => item.entityId === "h-upasana")).toBe(false);
  });

  it("gives a member without health.manage no health facts at all, and answers honestly", () => {
    const helper = itemsFor({ memberId: "sunita", permissions: [], tone: "helper" });
    const { reading, relevant } = ask("What health appointments do I have?", { items: helper, viewer: "sunita" });
    expect(relevant.some((fact) => fact.privacyClass === "health")).toBe(false);
    expect(composeFromFacts(relevant, reading)).toBeNull();
    expect(unknownAnswer(reading)).toMatch(/^WonderHome does not have anything on record about that/);
  });

  it("answers 'will the appointment clash?' with the clash, never what the appointment is for", () => {
    const { facts } = ask("Will my appointment clash with anything on Friday?");
    const clash = facts.find((fact) => fact.domain === "conflict");
    expect(clash?.statement).toContain("an appointment");
    expect(clash?.statement).toContain("Office review");
    expect(clash?.statement).not.toContain("dentist");
    expect(clash?.privacyClass).toBe("general");
  });
});

describe("The grounded fact contract (§6)", () => {
  const { facts } = ask("Which bills are due this week?");

  it("gives every fact an opaque id, its sources, confidence and privacy class", () => {
    const electricity = facts.find((fact) => fact.statement.includes("Electricity"))!;
    expect(electricity.contextId).toMatch(/^F\d+$/);
    expect(electricity.sourceIds).toEqual(expect.arrayContaining(["obligations:b-electricity", "homesend_intake:hs-1"]));
    expect(electricity.privacyClass).toBe("financial");
    expect(electricity.confidence).toBe(1);
  });

  it("hands the gate the same ids, never a row id", () => {
    const candidates = gateCandidates(facts);
    expect(candidates.every((candidate) => /^F\d+$/.test(candidate.id))).toBe(true);
    expect(JSON.stringify(candidates)).not.toContain("b-electricity");
  });
});

// ---------------------------------------------------------------------------
// Validation (§7)
// ---------------------------------------------------------------------------

const SENT_FACTS = [
  { id: "F1", text: "Electricity (utility) is received, ₹2,400, due 2026-09-25, Adult A's to handle." },
  { id: "F2", text: "Sports Day (school event) is on Sat 26 Sep at 9:00am, with Child A." },
  { id: "F3", text: "Child A has an appointment on Fri 25 Sep." },
];
const VALIDATION = { facts: SENT_FACTS, question: "What is coming up?", localNow: "Wed 23 Sep, 11:30am", today: TODAY };
const draft = (text: string, usedFacts: string[] = ["F1"]) => ({ text, usedFacts });

describe("Post-generation validation", () => {
  it("accepts an answer that says only what the facts say", () => {
    const result = validateAnswer(draft("Adult A has the Electricity bill of ₹2,400 due on Friday, and Child A has Sports Day on Saturday.", ["F1", "F2"]), VALIDATION);
    expect(result).toEqual({ ok: true, violations: [] });
  });

  it.each([
    ["an unsupported name", "Priya will pay the Electricity bill.", "unsupported_name"],
    ["an unknown placeholder", "Child C has Sports Day.", "unsupported_name"],
    ["an unsupported date", "The bill is due on 30 Sep.", "unsupported_date"],
    ["an unsupported weekday", "Sports Day is on Monday.", "unsupported_date"],
    ["an unsupported amount", "The bill is ₹3,100.", "unsupported_amount"],
    ["an unsupported amount in Singapore dollars", "The bill is SGD 120.", "unsupported_amount"],
    ["an unsupported amount in S$", "The bill is S$120.", "unsupported_amount"],
    ["an unsupported amount in dirhams", "The bill is 300 AED.", "unsupported_amount"],
    ["an unsupported time", "Sports Day starts at 7:30pm.", "unsupported_time"],
    ["an unsupported bare time", "Sports Day starts at 10:15.", "unsupported_time"],
    ["an unsupported event", "There is also a birthday party on Saturday.", "unsupported_event"],
    ["a diagnosis", "Child A might have a fever, so take paracetamol.", "unsupported_health_claim"],
    ["a dose", "Give 250 mg before the appointment.", "unsupported_health_claim"],
    ["a connected-service claim", "It's synced with your Google Calendar.", "unsupported_integration"],
    ["a claim to have done something", "I've added the bill to your list.", "unsupported_action"],
    ["a passive claim with no record behind it", "The bill has been paid.", "unsupported_action"],
    ["a leading done", "Done — the bill is sorted.", "unsupported_action"],
  ])("rejects %s", (_label, text, kind) => {
    const result = validateAnswer(draft(text), VALIDATION);
    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.kind)).toContain(kind);
  });

  it("accepts a time the facts give, however it is written", () => {
    for (const text of ["Sports Day is at 9:00am.", "Sports Day is at 9am.", "Sports Day is at 9 a.m.", "Sports Day starts at 09:00.", "It is 11:30am now."]) {
      expect(validateAnswer(draft(text, ["F2"]), VALIDATION), text).toEqual({ ok: true, violations: [] });
    }
  });

  it("rejects a cited fact that was never given", () => {
    expect(validateAnswer(draft("The bill is due soon.", ["F9"]), VALIDATION).violations).toEqual([{ kind: "unknown_fact", value: "F9" }]);
  });

  it("allows a total of the amounts it cites", () => {
    const facts = [...SENT_FACTS, { id: "F4", text: "Internet (utility) is received, ₹999, due 2026-10-10." }];
    expect(validateAnswer(draft("Together that is ₹3,399.", ["F1", "F4"]), { ...VALIDATION, facts }).ok).toBe(true);
  });

  it("does not mistake ordinary words for claims", () => {
    const text = "Nothing needs you on the Groceries screen. The amounts match, and Child A sat the exam? No — there's no exam on record.";
    const result = validateAnswer(draft(text, []), { ...VALIDATION, question: "Does Child A have an exam?" });
    expect(result.violations.filter((violation) => violation.kind !== "unsupported_event")).toEqual([]);
  });
});

describe("Compose, validate, regenerate, fall back", () => {
  const good: ModelDraft = { text: "Adult A has the Electricity bill of ₹2,400 due on Friday.", mode: "answer", grounded: true, usedFacts: ["F1"] };
  const bad: ModelDraft = { text: "I've paid the ₹3,000 bill.", mode: "answer", grounded: true, usedFacts: ["F1"] };

  it("accepts a first draft that passes", async () => {
    const outcome = await composeGrounded({ facts: SENT_FACTS, compose: async () => good, validation: VALIDATION });
    expect(outcome).toMatchObject({ status: "accepted", attempts: 1 });
  });

  it("regenerates once with only the cited facts and the problems named", async () => {
    const requests: { facts: number; problems: readonly string[] }[] = [];
    const outcome = await composeGrounded({
      facts: SENT_FACTS,
      compose: async (request) => {
        requests.push({ facts: request.facts.length, problems: request.problems });
        return requests.length === 1 ? bad : good;
      },
      validation: VALIDATION,
    });
    expect(outcome).toMatchObject({ status: "accepted", attempts: 2 });
    expect(requests[1]!.facts).toBe(1);
    expect(requests[1]!.problems.join(" ")).toContain("claims something was done");
  });

  it("never silently accepts a draft that fails twice", async () => {
    const outcome = await composeGrounded({ facts: SENT_FACTS, compose: async () => bad, validation: VALIDATION });
    expect(outcome.status).toBe("rejected");
    expect(outcome.rejected.map((violation) => violation.kind)).toEqual(expect.arrayContaining(["unsupported_action", "unsupported_amount"]));
  });

  it("reports a model that did not answer, without retrying the outage", async () => {
    let calls = 0;
    const outcome = await composeGrounded({ facts: SENT_FACTS, compose: async () => (calls++, null), validation: VALIDATION });
    expect(outcome).toMatchObject({ status: "no_answer", attempts: 1 });
    expect(calls).toBe(1);
  });
});

describe("Modes (§11)", () => {
  it("reserves done for a confirmed execution", () => {
    expect(modeFor("executed", true)).toBe("done");
    expect(modeFor("executed", false)).toBe("answer");
    expect(modeFor("executed")).toBe("answer");
    expect(modeFor("approve", true)).toBe("done");
    expect(modeFor("needs_approval")).toBe("approval");
    expect(modeFor("prepared")).toBe("prepare");
    expect(modeFor("clarify")).toBe("clarify");
    expect(modeFor("answer")).toBe("answer");
  });
});

describe("What is and is not a 'why?' question", () => {
  it.each(["What does Asmi have tomorrow?", "Which bills are due this week?", "Add milk to the list", "Why is the sky blue"])("%s is not one", (question) => {
    expect(readWhyQuestion(question)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The whole turn, with a stand-in model
// ---------------------------------------------------------------------------

const PEOPLE = MEMBERS.map((person) => ({ id: person.id, displayName: person.displayName, memberType: person.memberType }));
const EVERYTHING: DataUsePolicy = { ...DEFAULT_DATA_USE, allowedClasses: CONTENT_CLASSES.filter((entry) => entry !== "credential") };

function turn(question: string, compose: HomeBrainTurn["compose"], extra: Partial<HomeBrainTurn> = {}): Promise<Awaited<ReturnType<typeof answerWithHomeBrain>>> {
  return answerWithHomeBrain({
    question,
    sentQuestion: question,
    previousQuestion: null,
    sentHistory: [],
    items: KUNAL,
    viewer: { memberId: "kunal", roleLabel: "Admin" },
    timezone: TZ,
    now: NOW,
    policy: EVERYTHING,
    people: PEOPLE,
    compose,
    factBudget: 80,
    ...extra,
  });
}

describe("A HomeBrain turn", () => {
  it("sends only what consent allows, pseudonymised, and restores names in a validated answer", async () => {
    const seen: AnswerInput[] = [];
    const answer = await turn("Which bills are due this week?", async (input) => {
      seen.push(input);
      const electricity = input.facts.find((fact) => fact.text.includes("Electricity"))!;
      return { text: "Adult A has the Electricity bill of ₹2,400 due on Friday.", mode: "answer", grounded: true, usedFacts: [electricity.id] };
    });
    expect(answer.source).toBe("model");
    expect(answer.text).toBe("Kunal has the Electricity bill of ₹2,400 due on Friday.");
    const sent = seen[0]!.facts.map((fact) => fact.text).join("\n");
    expect(sent).not.toContain("Kunal");
    expect(sent).toContain("Adult A");
    expect(seen[0]!.facts.every((fact) => /^F\d+$/.test(fact.id))).toBe(true);
  });

  it("never lets a financial fact out under the default consent", async () => {
    let sent = "";
    await turn("Which bills are due this week?", async (input) => {
      sent = input.facts.map((fact) => fact.text).join("\n");
      return null;
    }, { policy: DEFAULT_DATA_USE });
    expect(sent).not.toContain("₹");
    expect(sent).not.toContain("Electricity");
  });

  it("regenerates once when a draft invents, then accepts a clean one", async () => {
    let calls = 0;
    const answer = await turn("Which bills are due this week?", async (input) => {
      calls += 1;
      const electricity = input.facts.find((fact) => fact.text.includes("Electricity"))!;
      return calls === 1
        ? { text: "I've paid the Electricity bill.", mode: "answer", grounded: true, usedFacts: [electricity.id] }
        : { text: "The Electricity bill of ₹2,400 is due on Friday.", mode: "answer", grounded: true, usedFacts: [electricity.id] };
    });
    expect(calls).toBe(2);
    expect(answer.source).toBe("model_regenerated");
    expect(answer.validation).toEqual({ attempts: 2, rejected: ["unsupported_action"] });
  });

  it("falls back to the facts themselves when the model keeps inventing", async () => {
    const answer = await turn("Which bills are due this week?", async () => ({ text: "Priya will pay the ₹9,999 bill.", mode: "answer", grounded: true, usedFacts: [] }));
    expect(answer.source).toBe("deterministic");
    expect(answer.text).toContain("Electricity");
    expect(answer.text).not.toContain("9,999");
    expect(answer.validation.rejected).toEqual(expect.arrayContaining(["unsupported_name", "unsupported_amount"]));
  });

  it("answers deterministically with no model at all", async () => {
    const answer = await turn("What does Manan have tomorrow?", null);
    expect(answer.source).toBe("deterministic");
    expect(answer.text).toContain("Karate");
    expect(answer.factsSent).toBe(0);
  });

  it("asks rather than guesses, without calling the model", async () => {
    let called = false;
    const answer = await turn("What does the kid have tomorrow?", async () => ((called = true), null));
    expect(called).toBe(false);
    expect(answer.mode).toBe("clarify");
    expect(answer.text).toMatch(/Asmi.*Manan|Manan.*Asmi/);
  });

  it("says plainly when nothing is on record, and leaves a broad question to the home summary", async () => {
    const unknown = await turn("What does Asmi have next week?", null);
    expect(unknown.source).toBe("not_on_record");
    expect(unknown.text).toMatch(/^WonderHome does not have anything on record about that for Asmi next week yet/);

    const broad = await turn("How are things?", null, { items: itemsFor({ memberId: "kunal" }, { members: MEMBERS }) });
    expect(broad.text).toBeNull();
  });
});

describe("Corrections and current truth (§8, §9)", () => {
  const correction: ContextRecords = {
    ...RECORDS,
    memories: [
      { id: "m-old", scope: "member", memberId: "asmi", category: "preference", key: "pref.asmi.mushroom", value: { statement: "Asmi doesn't like mushrooms", subject: "Asmi", object: "mushrooms", stance: "dislikes" }, status: "learned", confidence: 0.88, sourceType: "conversation", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" },
      { id: "m-new", scope: "member", memberId: "asmi", category: "preference", key: "pref.asmi.mushroom", value: { statement: "Asmi is okay with mushrooms", subject: "Asmi", object: "mushrooms", stance: "okay_with" }, status: "learned", confidence: 0.88, sourceType: "conversation", createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z" },
    ],
    beliefs: [
      { id: "b-bedtime", category: "home_routines", claim: "The children are in bed by 9pm on school nights.", scope: "household", memberId: null, sourceType: "setup", sourceDetail: "added by Kunal Mehta", status: "confirmed", createdAt: "2026-09-20T00:00:00Z", reviewedAt: "2026-09-20T00:00:00Z" },
    ],
  };
  const items = itemsFor({ memberId: "kunal" }, correction);

  it("answers from the correction, never the belief it replaced", () => {
    const { text } = ask("Does Asmi like mushrooms?", { items });
    expect(text).toContain("Asmi is okay with mushrooms");
    expect(text).not.toContain("doesn't like mushrooms");
    expect(items.find((item) => item.entityId === "m-old")?.freshness).toBe("superseded");
  });

  it("keeps a child's preference in the child's privacy class", () => {
    expect(items.find((item) => item.entityId === "m-new")?.privacyClass).toBe("child");
  });

  it("answers from a Review belief the question paraphrases, with no model", () => {
    const { reading, relevant } = ask("When do the children go to bed?", { items });
    expect(composeFromFacts(relevant, reading)).toContain("The children are in bed by 9pm on school nights (registered)");
  });

  it("reads what the household confirmed in HomeBrain Review, and says where it came from", () => {
    const { text } = ask("When do the children go to bed?", { items });
    expect(text).toContain("The children are in bed by 9pm on school nights (registered).");
    const why = readWhyQuestion("Where did that come from?")!;
    const answer = explain({ ...why, items, viewerMemberId: "kunal", timezone: TZ, now: NOW, lastAssistantText: "The children are in bed by 9pm on school nights.", lastAction: null, clarifying: null });
    expect(answer.text).toContain("Something the household told WonderHome in HomeBrain, and confirmed.");
  });
});

// ---------------------------------------------------------------------------
// Looking deeper (HomeBrain 4.0 §3.7, story 14-026)
// ---------------------------------------------------------------------------

describe("Looking deeper before 'nothing on record'", () => {
  // A stored context that missed the bills — a builder or a write path that forgot them.
  const STALE = itemsFor({ memberId: "kunal" }, { ...RECORDS, obligations: [] });

  it("reads the named part of the home again, live, and answers from it", async () => {
    const asked: string[][] = [];
    const answer = await turn("Which bills are due this week?", null, {
      items: STALE,
      deepRead: async (domains) => {
        asked.push(domains);
        return KUNAL.filter((item) => domains.includes(item.domain));
      },
    });
    expect(asked).toEqual([expect.arrayContaining(["bills"])]);
    expect(answer.text).toContain("Electricity");
    expect(answer.deepRead).toMatchObject({ found: true, trigger: expect.stringMatching(/not_on_record|unknown/) });
  });

  it("says it looked when the live read has nothing either, and never invents", async () => {
    const answer = await turn("Which bills are due this week?", null, { items: STALE, deepRead: async () => [] });
    expect(answer.text ?? "").not.toContain("Electricity");
    expect(answer.deepRead).toMatchObject({ found: false });
  });

  it("does not look when the stored context already answers", async () => {
    let looked = false;
    const answer = await turn("Which bills are due this week?", null, { deepRead: async () => ((looked = true), []) });
    expect(looked).toBe(false);
    expect(answer.deepRead).toBeUndefined();
  });

  it("a read that hangs is a read that found nothing", async () => {
    const answer = await turn("Which bills are due this week?", null, { items: STALE, deepRead: () => new Promise(() => undefined) });
    expect(answer.deepRead).toMatchObject({ found: false });
  }, 5000);

  it("looks again when asked to, even after an answer", async () => {
    let looked = false;
    await turn("Which bills are due this week?", null, { deeper: true, deepRead: async (domains) => ((looked = true), KUNAL.filter((item) => domains.includes(item.domain))) });
    expect(looked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The household graph (HomeBrain 4.0 §3.3–§3.4, story 14-028)
// ---------------------------------------------------------------------------

describe("Following the household graph", () => {
  it("brings the day's other plans along with the event asked about, below the answer", () => {
    const { reading, facts } = ask("When is the office review?");
    const linked = facts.filter((fact) => fact.reasons.some((reason) => reason.startsWith("on the same day as")));
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.every((fact) => fact.relevant && fact.score === 0.45)).toBe(true);
    // A rules answer is still the review alone.
    const answer = composeFromFacts(facts, reading) ?? "";
    expect(answer).toContain("Office review");
    expect(answer).not.toContain("Electricity");
  });

  it("links a meal to the grocery item it is short of", () => {
    const graph = buildHouseholdGraph(KUNAL);
    const meal = KUNAL.find((item) => item.entityType === "meal")!;
    const pasta = KUNAL.find((item) => item.entityType === "consumable" && item.attributes.title === "Pasta")!;
    expect(graph.edges).toContainEqual({ from: meal.id, to: pasta.id, kind: "needs" });
  });

  it("links a responsibility to its owner and backup", () => {
    const graph = buildHouseholdGraph(KUNAL);
    const groceries = KUNAL.find((item) => item.entityType === "responsibility" && item.attributes.outcomeKey === "groceries.stocked")!;
    const owners = graph.edges.filter((edge) => edge.from === groceries.id && edge.kind === "responsible_for").map((edge) => KUNAL.find((item) => item.id === edge.to)?.entityId);
    expect(owners.sort()).toEqual(["kunal", "upasana"]);
  });

  it("never links to what the viewer cannot see: Asmi's graph has no one else's appointment", () => {
    const asmi = itemsFor({ memberId: "asmi", tone: "child", permissions: [] });
    const graph = buildHouseholdGraph(asmi);
    const ids = new Set(asmi.map((item) => item.id));
    expect(graph.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    expect(asmi.some((item) => item.domain === "health")).toBe(false);
  });

  it("never lifts a fact about someone the question did not ask about", () => {
    const { facts } = ask("What does Asmi have tomorrow?");
    expect(facts.filter((fact) => fact.relevant && fact.statement.includes("Maths worksheet"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Inferences with evidence (HomeBrain 4.0 §3.5, story 14-029)
// ---------------------------------------------------------------------------

describe("Inferences the rules draw, with their evidence", () => {
  const LINKED: ContextRecords = {
    ...RECORDS,
    events: [
      ...RECORDS.events!,
      // Thu 24 Sep, 7 pm in Kolkata.
      event("e-movie", "Movie night", ["kunal", "asmi"], "2026-09-24T13:30:00Z", { kind: "family_time" }),
    ],
    eventGuests: [
      { eventId: "e-dinner", name: "The Sharmas", response: "yes", partySize: 3, note: null },
      { eventId: "e-dinner", name: "Meera", response: "yes", partySize: 1, note: null },
      { eventId: "e-dinner", name: "The Raos", response: "maybe", partySize: 2, note: null },
    ],
    schoolItems: [...RECORDS.schoolItems!, { ...schoolItem("s-exam", "asmi", "Unit test 2", "Maths", "2026-09-25T04:30:00Z"), kind: "exam" }],
    absences: [
      { memberId: "sunita", onDate: TODAY, available: false, reason: null },
      { memberId: "kunal", onDate: "2026-09-25", available: false, reason: "travel" },
      { memberId: "upasana", onDate: "2026-09-24", available: false, reason: null },
    ],
  };
  const items = itemsFor({ memberId: "kunal" }, LINKED);
  const drawn = householdInsights(items, { timezone: TZ, today: TODAY, question: "How many people are coming?" });
  const rule = (name: string) => drawn.filter((insight) => insight.rule === name);

  it("notices an evening plan the night before a child's exam", () => {
    expect(rule("night_before").map((insight) => insight.statement)).toEqual(["Movie night on Thursday evening is the night before Asmi's Maths exam (Unit test 2) on Friday."]);
    expect(rule("night_before")[0]!.evidence).toHaveLength(2);
  });

  it("notices a meal short of things, a cook who is away, a bill due while its payer is away, and a duty nobody covers", () => {
    expect(rule("meal_short")[0]!.statement).toBe("Wednesday's dinner, Pasta arrabbiata, needs 1 thing not at home: Pasta.");
    expect(rule("away_but_assigned")[0]!.statement).toContain("Sunita is away on Wednesday");
    expect(rule("bill_before_trip")[0]!.statement).toBe("The Electricity bill is due on Friday 25 Sep, a day Kunal is away.");
    expect(rule("routine_gap").map((insight) => insight.statement)).toContain("Upasana is away on Thursday and nobody backs them up for school run.");
  });

  it("HT-111: counts who is coming as arithmetic over the replies", () => {
    const { reading, facts } = ask("How many people are coming to the family dinner?", { items });
    const count = facts.find((fact) => fact.domain === "insight" && fact.statement.startsWith("4 guests"));
    expect(count?.statement).toBe("4 guests are coming to Family dinner (The Sharmas 3 + Meera 1), from 3 replies; 1 not decided yet.");
    expect(count?.relevant).toBe(true);
    expect(composeFromFacts(facts, reading)).toContain("4 guests are coming");
  });

  it("sends an inference with its evidence and leads with it for the day it is about", () => {
    const { reading, facts } = ask("What's on Thursday?", { items });
    const insight = facts.find((fact) => fact.domain === "insight" && fact.statement.startsWith("Movie night"));
    expect(insight?.relevant).toBe(true);
    const evidence = facts.filter((fact) => insight!.evidence!.includes(fact.contextId));
    expect(evidence.map((fact) => fact.statement).join(" ")).toMatch(/Movie night.*Unit test 2|Unit test 2.*Movie night/s);
    expect(evidence.every((fact) => fact.relevant)).toBe(true);
    expect(composeFromFacts(facts, reading)).toContain("night before Asmi's Maths exam");
  });

  it("draws nothing from what the viewer may not see", () => {
    const manan = itemsFor({ memberId: "manan", tone: "child", permissions: [] }, LINKED);
    const theirs = householdInsights(manan, { timezone: TZ, today: TODAY });
    const visible = new Set(manan.map((item) => item.id));
    expect(theirs.every((insight) => insight.evidence.every((id) => visible.has(id)))).toBe(true);
    // Bills are not a child's to read, so neither is a bill due while someone is away.
    expect(theirs.some((insight) => insight.rule === "bill_before_trip")).toBe(false);
  });

  it("HT-108/HT-109: a model's own 'because' is refused; the same link cited from an inference stands", () => {
    const facts = [
      { id: "F1", text: "Movie night (family time) is on Thu 24 Sep at 7:00pm, with Kunal, Asmi." },
      { id: "F2", text: "Asmi has exam: Unit test 2 (Maths), due Fri 25 Sep, pending." },
      { id: "F3", text: "Movie night on Thursday evening is the night before Asmi's Maths exam (Unit test 2) on Friday." },
    ];
    const context = { facts, question: "Is Thursday ok for movie night?", localNow: "Wed 23 Sep, 11:30am", today: TODAY, inferences: ["F3"] };
    const invented = validateAnswer({ text: "Thursday may not suit, because Asmi has her Maths exam on Friday.", usedFacts: ["F1", "F2"] }, context);
    expect(invented.violations.map((violation) => violation.kind)).toContain("unsupported_inference");
    const cited = validateAnswer({ text: "Thursday may not suit, because Asmi has her Maths exam on Friday.", usedFacts: ["F1", "F2", "F3"] }, context);
    expect(cited.violations.map((violation) => violation.kind)).not.toContain("unsupported_inference");
  });
});

describe("Answers shaped to the person's goal (HomeBrain 4.0 §3.10, story 14-030)", () => {
  const LINKED: ContextRecords = {
    ...RECORDS,
    events: [...RECORDS.events!, event("e-movie", "Movie night", ["kunal", "asmi"], "2026-09-24T13:30:00Z", { kind: "family_time" })],
    schoolItems: [...RECORDS.schoolItems!, { ...schoolItem("s-exam", "asmi", "Unit test 2", "Maths", "2026-09-25T04:30:00Z"), kind: "exam" }],
  };
  const items = itemsFor({ memberId: "kunal" }, LINKED);

  it("to find out: the fact first, what the rules noticed after", () => {
    const { reading, facts } = ask("When is movie night?", { items });
    expect(reading.goal).toBe("find_out");
    const answer = composeFromFacts(facts, reading) ?? "";
    expect(answer.indexOf("Movie night (family time)")).toBeGreaterThan(-1);
    expect(answer.indexOf("Movie night (family time)")).toBeLessThan(answer.indexOf("night before"));
  });

  it("to decide: what decides it leads, said as that", () => {
    const { reading, facts } = ask("Should we do movie night on Thursday?", { items });
    expect(reading.goal).toBe("decide");
    const answer = composeFromFacts(facts, reading) ?? "";
    expect(answer).toMatch(/^Here is what WonderHome has on record that bears on it/);
    expect(answer.split("\n")[1]).toContain("night before Asmi's Maths exam");
  });

  it("to check whether anything is there: yes first, then the evidence", () => {
    const { reading, facts } = ask("Is there anything on Thursday?", { items });
    expect(reading.goal).toBe("check");
    expect(composeFromFacts(facts, reading)).toMatch(/^Yes\. /);
  });

  it("never answers 'did it happen?' with a yes the record does not say", () => {
    const { reading, facts } = ask("Did Kunal pay the electricity bill?", { items });
    expect(composeFromFacts(facts, reading) ?? "").not.toMatch(/^Yes/);
  });
});

describe("The facts budget is tokens, not only a count (HomeBrain 4.0 §3.4, story 14-027)", () => {
  it("stops choosing facts once about that many tokens are chosen, keeping the most relevant", () => {
    const { reading } = ask("What do we need today?");
    const all = groundFacts(KUNAL, reading, { timezone: TZ, today: TODAY });
    const tight = groundFacts(KUNAL, reading, { timezone: TZ, today: TODAY, tokenBudget: 40 });
    const chosen = tight.filter((fact) => fact.relevant);
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen.length).toBeLessThan(all.filter((fact) => fact.relevant).length);
    expect(chosen[0]!.statement).toBe(all.find((fact) => fact.relevant)!.statement);
  });
});

// ---------------------------------------------------------------------------
// The owner's report (2026-10-21): "links are not appearing in chat anymore"
// ---------------------------------------------------------------------------

describe("An answer composed from the facts is written for a person (the owner, 2026-10-21)", () => {
  // The owner's turn: "what do you know about the family", read as a status
  // question; the model's drafts refused twice for an unsupported name; the
  // facts shown as they were written for a model.
  const records: ContextRecords = {
    ...RECORDS,
    agenda: {
      needsYou: [
        { subjectKey: "bill.e-1", title: "Electricity", status: "at_risk", riskLevel: "high", notable: true, reason: "Electricity was due 21 days ago.", action: { action: "pay_bill" }, dueOn: "2026-09-02" },
        { subjectKey: "asset.ac-1", title: "Air Conditioners", status: "at_risk", riskLevel: "medium", notable: true, reason: "Air Conditioners is due for service in 8 days. It is covered by annual maintenance contract.", action: { action: "book_service" }, dueOn: "2026-10-01" },
      ],
      handled: [{ key: "home", title: "Home & upkeep" }, { key: "bills", title: "Bills" }],
      checked: 37,
      unavailable: [],
    },
  };
  const items = itemsFor({ memberId: "kunal" }, records);
  const inventing: HomeBrainTurn["compose"] = async () => ({ text: "Priya will sort it out.", mode: "answer", grounded: true, usedFacts: [] });
  const ISO_DAY = /\b\d{4}-\d{2}-\d{2}\b/;

  it("names each thing, says its day in words, drops the action code and links to its screen", async () => {
    const answer = await turn("What needs attention?", inventing, { items });
    expect(answer.source).toBe("deterministic");
    expect(answer.text).toContain("- **Electricity** (urgent) — Electricity was due 21 days ago (due Wed 2 Sep) → [Bills](/bills)");
    expect(answer.text).toContain("**Air Conditioners** — Air Conditioners is due for service in 8 days. It is covered by annual maintenance contract (due Thu 1 Oct) → [Home & upkeep](/household/home)");
    expect(answer.text).toContain("WonderHome checked 37 things across home & upkeep, bills and 2 need someone → [Home](/)");
    expect(answer.text).not.toMatch(ISO_DAY);
    expect(answer.text).not.toMatch(/suggested:|pay_bill|book_service|Needs attention/);
  });

  it("every line it lists carries a link the chat renders", async () => {
    const answer = await turn("Which bills are due this week?", null, { items });
    const lines = (answer.text ?? "").split("\n").filter((line) => line.startsWith("- "));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/→ \[[^\]]+\]\(\/[a-z/-]*\)$/);
    expect(answer.text).not.toMatch(ISO_DAY);
  });

  it("'what do you know about the family' leads with the family, each at a glance, then what needs attention", async () => {
    const answer = await turn("what do you know about the family", inventing, { items });
    expect(answer.reading.aboutFamily).toBe(true);
    expect(answer.reading.people).toEqual([]);
    const text = answer.text ?? "";
    expect(text).toMatch(/^Here is what WonderHome has on record about the family:/);
    const lines = text.split("\n");
    expect(lines[1]).toContain("Kunal at a glance");
    for (const name of ["Kunal", "Upasana", "Asmi", "Manan", "Sunita"]) expect(text).toContain(name);
    // The family first; the bills after it.
    expect(text.indexOf("Manan")).toBeLessThan(text.indexOf("Electricity"));
    expect(text).not.toMatch(ISO_DAY);
    expect(text).not.toMatch(/suggested:|pay_bill/);
    // Never health or money in a person at a glance.
    expect(lines.filter((line) => line.includes("at a glance")).join("\n")).not.toMatch(/dentist|Dr\. Rao|₹/);
  });

  it("'my family' is the whole family, not the person asking", () => {
    const { reading } = ask("What do you know about my family?");
    expect(reading.aboutFamily).toBe(true);
    expect(reading.people).toEqual([]);
    expect(reading.focus.has("people")).toBe(true);
  });

  it("is not a question about the family's calendar or dinner", () => {
    expect(ask("What do you know about the family calendar?").reading.aboutFamily).toBeUndefined();
    expect(ask("Tell me about the family dinner").reading.aboutFamily).toBeUndefined();
  });

  it("a model's answer that links to the People screen is not refused as a name (the refusal behind the owner's turn)", async () => {
    let calls = 0;
    const answer = await turn("what do you know about the family", async (input) => {
      calls += 1;
      const member = input.facts.find((fact) => fact.text.startsWith("Child A is a child"))!;
      return { text: "Two children and two adults.\n- **Child A** — a child → [People](/household/members)\n- More on the [Calendar](/calendar)", mode: "answer", grounded: true, usedFacts: [member.id] };
    }, { items });
    expect(calls).toBe(1);
    expect(answer.source).toBe("model");
    expect(answer.validation.rejected).toEqual([]);
    expect(answer.text).toContain("**Asmi**");
  });

  it("a model's accepted answer says a day as a day, and keeps a day in a link's path", async () => {
    const answer = await turn("Which bills are due this week?", async (input) => {
      const electricity = input.facts.find((fact) => fact.text.includes("Electricity (utility)"))!;
      return { text: "The **Electricity** bill of ₹2,400 is due 2026-09-25 → [Bills](/bills?due=2026-09-25)", mode: "answer", grounded: true, usedFacts: [electricity.id] };
    }, { items });
    expect(answer.source).toBe("model");
    expect(answer.text).toBe("The **Electricity** bill of ₹2,400 is due Fri 25 Sep → [Bills](/bills?due=2026-09-25)");
  });
});
